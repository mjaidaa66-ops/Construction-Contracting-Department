using System;
using System.Configuration;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using Bunyan.EtabsAgent.Security;
using Bunyan.EtabsAgent.Services;

namespace Bunyan.EtabsAgent
{
    internal static class Program
    {
        public static async Task<int> Main(string[] args)
        {
            string host = ConfigurationManager.AppSettings["ListenHost"] ?? "127.0.0.1";
            int port = int.TryParse(ConfigurationManager.AppSettings["ListenPort"], out var p) ? p : 45820;
            string? exePath = ConfigurationManager.AppSettings["EtabsExecutablePath"];
            bool readOnly = !string.Equals(ConfigurationManager.AppSettings["ReadOnlyMode"], "false", StringComparison.OrdinalIgnoreCase);

            string token = Environment.GetEnvironmentVariable("BUNYAN_AGENT_TOKEN") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(token))
            {
                byte[] randomBytes = new byte[24];
                using var rng = RandomNumberGenerator.Create();
                rng.GetBytes(randomBytes);
                token = Convert.ToBase64String(randomBytes)
                    .Replace("+", "-")
                    .Replace("/", "_")
                    .TrimEnd('=');

                Console.WriteLine("[Bunyan.EtabsAgent] Generated ephemeral session token (configure BUNYAN_AGENT_TOKEN to persist):");
                Console.WriteLine($"  STRUCTURAL_AGENT_TOKEN={token}");
            }

            var oapiClient = new EtabsOapiClient(exePath, readOnly);
            var status = oapiClient.GetStatus();
            Console.WriteLine($"[Bunyan.EtabsAgent] ETABS Installed: {status.EtabsInstalled} | Version: {status.InstalledVersion} | State: {status.ConnectionState}");

            using var cts = new CancellationTokenSource();
            Console.CancelKeyPress += (_, e) =>
            {
                e.Cancel = true;
                cts.Cancel();
            };

            using var server = new LocalHttpServer(host, port, token, oapiClient);
            await server.RunAsync(cts.Token);
            return 0;
        }
    }
}
