using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Bunyan.EtabsAgent.Models;
using Bunyan.EtabsAgent.Services;

namespace Bunyan.EtabsAgent.Security
{
    public sealed class LocalHttpServer : IDisposable
    {
        private readonly HttpListener _listener = new();
        private readonly EtabsOapiClient _oapiClient;
        private readonly string _token;
        private readonly JavaScriptSerializer _json = new() { MaxJsonLength = 64 * 1024 * 1024 };
        private readonly ConcurrentDictionary<string, CancellationTokenSource> _activeJobs = new();
        private CancellationTokenSource? _shutdownCts;

        public LocalHttpServer(string host, int port, string authToken, EtabsOapiClient oapiClient)
        {
            if (string.IsNullOrWhiteSpace(authToken) || authToken.Length < 16)
            {
                throw new ArgumentException("Agent authentication token must be at least 16 characters.");
            }

            string normalizedHost = host == "localhost" || host == "127.0.0.1" ? host : "127.0.0.1";
            _token = authToken;
            _oapiClient = oapiClient;
            _listener.Prefixes.Add($"http://{normalizedHost}:{port}/");
        }

        public async Task RunAsync(CancellationToken outerToken)
        {
            _shutdownCts = CancellationTokenSource.CreateLinkedTokenSource(outerToken);
            _listener.Start();
            Console.WriteLine($"[Bunyan.EtabsAgent] Listening securely on {_listener.Prefixes}");

            while (!_shutdownCts.Token.IsCancellationRequested)
            {
                try
                {
                    var context = await _listener.GetContextAsync();
                    _ = Task.Run(() => HandleRequestAsync(context, _shutdownCts.Token));
                }
                catch (HttpListenerException) when (_shutdownCts.Token.IsCancellationRequested)
                {
                    break;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
            }
        }

        private async Task HandleRequestAsync(HttpListenerContext ctx, CancellationToken shutdownToken)
        {
            var req = ctx.Request;
            var res = ctx.Response;
            res.Headers.Add("X-Content-Type-Options", "nosniff");

            try
            {
                string path = req.Url?.AbsolutePath ?? "/";

                if (string.Equals(path, "/health", StringComparison.OrdinalIgnoreCase) && req.HttpMethod == "GET")
                {
                    await WriteJsonAsync(res, 200, new
                    {
                        ok = true,
                        agent = "Bunyan.EtabsAgent",
                        readOnlyMode = true,
                        timestampUtc = DateTime.UtcNow.ToString("O")
                    });
                    return;
                }

                if (!IsAuthorized(req))
                {
                    await WriteJsonAsync(res, 401, new { error = "Unauthorized: valid agent bearer token required." });
                    return;
                }

                if (string.Equals(path, "/v1/etabs/status", StringComparison.OrdinalIgnoreCase) && req.HttpMethod == "GET")
                {
                    var status = _oapiClient.GetStatus();
                    await WriteJsonAsync(res, 200, status);
                    return;
                }

                if (string.Equals(path, "/v1/etabs/open-model", StringComparison.OrdinalIgnoreCase) && req.HttpMethod == "POST")
                {
                    var body = await ReadBodyAsync<EtabsOpenModelRequest>(req);
                    if (body == null)
                    {
                        await WriteJsonAsync(res, 400, new { error = "Invalid JSON body." });
                        return;
                    }
                    var status = _oapiClient.OpenAuthorizedModel(body);
                    await WriteJsonAsync(res, 200, status);
                    return;
                }

                if (string.Equals(path, "/v1/etabs/extract", StringComparison.OrdinalIgnoreCase) && req.HttpMethod == "POST")
                {
                    var body = await ReadBodyAsync<EtabsExtractRequest>(req) ?? new EtabsExtractRequest();
                    string jobId = string.IsNullOrWhiteSpace(body.JobId) ? Guid.NewGuid().ToString("N") : body.JobId;
                    body.JobId = jobId;

                    using var jobCts = CancellationTokenSource.CreateLinkedTokenSource(shutdownToken);
                    jobCts.CancelAfter(TimeSpan.FromSeconds(120));
                    _activeJobs[jobId] = jobCts;

                    try
                    {
                        var extracted = _oapiClient.ExtractActiveModel(body, jobCts.Token);
                        await WriteJsonAsync(res, 200, extracted);
                    }
                    finally
                    {
                        _activeJobs.TryRemove(jobId, out _);
                    }
                    return;
                }

                if (string.Equals(path, "/v1/etabs/cancel", StringComparison.OrdinalIgnoreCase) && req.HttpMethod == "POST")
                {
                    string? jobId = req.QueryString["jobId"];
                    if (!string.IsNullOrWhiteSpace(jobId) && _activeJobs.TryGetValue(jobId!, out var jobCts))
                    {
                        jobCts.Cancel();
                        await WriteJsonAsync(res, 200, new { cancelled = true, jobId });
                        return;
                    }
                    await WriteJsonAsync(res, 404, new { cancelled = false, error = "Active job not found." });
                    return;
                }

                await WriteJsonAsync(res, 404, new { error = "Unknown agent endpoint." });
            }
            catch (OperationCanceledException)
            {
                await WriteJsonAsync(res, 499, new { error = "Import job cancelled." });
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[Bunyan.EtabsAgent Error] {ex.Message}");
                await WriteJsonAsync(res, 400, new { error = ex.Message });
            }
        }

        private bool IsAuthorized(HttpListenerRequest req)
        {
            string? authHeader = req.Headers["Authorization"];
            string? customHeader = req.Headers["X-Bunyan-Agent-Token"];
            string candidate = string.Empty;

            if (!string.IsNullOrWhiteSpace(authHeader) && authHeader!.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                candidate = authHeader.Substring(7).Trim();
            }
            else if (!string.IsNullOrWhiteSpace(customHeader))
            {
                candidate = customHeader!.Trim();
            }

            if (string.IsNullOrEmpty(candidate)) return false;

            byte[] a = Encoding.UTF8.GetBytes(candidate);
            byte[] b = Encoding.UTF8.GetBytes(_token);
            if (a.Length != b.Length) return false;
            return CryptographicOperations.FixedTimeEquals(a, b);
        }

        private async Task<T?> ReadBodyAsync<T>(HttpListenerRequest req) where T : class
        {
            using var reader = new StreamReader(req.InputStream, req.ContentEncoding ?? Encoding.UTF8);
            string raw = await reader.ReadToEndAsync();
            if (string.IsNullOrWhiteSpace(raw)) return null;
            return _json.Deserialize<T>(raw);
        }

        private async Task WriteJsonAsync(HttpListenerResponse res, int statusCode, object payload)
        {
            string json = _json.Serialize(payload);
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            res.StatusCode = statusCode;
            res.ContentType = "application/json; charset=utf-8";
            res.ContentLength64 = bytes.Length;
            await res.OutputStream.WriteAsync(bytes, 0, bytes.Length);
            res.Close();
        }

        public void Dispose()
        {
            _shutdownCts?.Cancel();
            if (_listener.IsListening)
            {
                _listener.Stop();
            }
            _listener.Close();
        }
    }
}
