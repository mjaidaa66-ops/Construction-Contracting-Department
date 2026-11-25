import type { EtabsAgentStatus, EtabsRawExtractPayload } from '../types/etabs.types';

export interface EtabsAdapterConfig {
  agentUrl: string;
  agentToken: string;
  timeoutMs: number;
  allowRemoteAgent?: boolean;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function validateAgentBaseUrl(rawUrl: string, allowRemote = false): URL {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Structural Agent URL must use HTTP or HTTPS protocol.');
  }
  if (!allowRemote && !LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(
      `Security policy blocks non-loopback Structural Agent host '${parsed.hostname}'. Configure 127.0.0.1 or localhost.`
    );
  }
  return parsed;
}

export class EtabsAgentAdapter {
  private readonly config: EtabsAdapterConfig;

  constructor(config?: Partial<EtabsAdapterConfig>) {
    this.config = {
      agentUrl: config?.agentUrl || process.env.STRUCTURAL_AGENT_URL || 'http://127.0.0.1:45820',
      agentToken: config?.agentToken || process.env.STRUCTURAL_AGENT_TOKEN || '',
      timeoutMs: config?.timeoutMs ?? 8000,
      allowRemoteAgent:
        config?.allowRemoteAgent ?? process.env.ALLOW_REMOTE_STRUCTURAL_AGENT === 'true',
    };
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.agentToken) {
      headers.Authorization = `Bearer ${this.config.agentToken}`;
      headers['X-Bunyan-Agent-Token'] = this.config.agentToken;
    }
    return headers;
  }

  async getStatus(signal?: AbortSignal): Promise<EtabsAgentStatus> {
    const now = new Date().toISOString();
    let base: URL;
    try {
      base = validateAgentBaseUrl(this.config.agentUrl, Boolean(this.config.allowRemoteAgent));
    } catch (err) {
      return {
        agentReachable: false,
        agentVersion: 'none',
        platform: 'unavailable',
        readOnlyMode: true,
        etabsInstalled: false,
        etabsV20Compatible: false,
        installedVersion: '',
        installPath: '',
        oapiDllPath: '',
        activeInstanceRunning: false,
        activeModelPath: '',
        activeModelName: '',
        modelLocked: false,
        connectionState: 'AGENT_ERROR',
        message: err instanceof Error ? err.message : 'Invalid agent URL configuration.',
        checkedAtUtc: now,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const target = new URL('/v1/etabs/status', base);
      const response = await fetch(target.toString(), {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          agentReachable: response.status !== 502 && response.status !== 503,
          agentVersion: 'unknown',
          platform: 'windows',
          readOnlyMode: true,
          etabsInstalled: false,
          etabsV20Compatible: false,
          installedVersion: '',
          installPath: '',
          oapiDllPath: '',
          activeInstanceRunning: false,
          activeModelPath: '',
          activeModelName: '',
          modelLocked: false,
          connectionState: response.status === 401 ? 'AGENT_ERROR' : 'AGENT_UNAVAILABLE',
          message:
            response.status === 401
              ? 'Windows Engineering Agent rejected bearer token authentication (401 Unauthorized).'
              : `Windows Engineering Agent returned HTTP ${response.status}: ${text || response.statusText}`,
          checkedAtUtc: now,
        };
      }

      const raw = (await response.json()) as Record<string, unknown>;
      return {
        agentReachable: true,
        agentVersion: String(raw.agentVersion ?? raw.AgentVersion ?? '1.0.0'),
        platform: String(raw.platform ?? raw.Platform ?? 'win-x64-net48'),
        readOnlyMode: Boolean(raw.readOnlyMode ?? raw.ReadOnlyMode ?? true),
        etabsInstalled: Boolean(raw.etabsInstalled ?? raw.EtabsInstalled ?? false),
        etabsV20Compatible: Boolean(raw.etabsV20Compatible ?? raw.EtabsV20Compatible ?? false),
        installedVersion: String(raw.installedVersion ?? raw.InstalledVersion ?? ''),
        installPath: String(raw.installPath ?? raw.InstallPath ?? ''),
        oapiDllPath: String(raw.oapiDllPath ?? raw.OapiDllPath ?? ''),
        activeInstanceRunning: Boolean(raw.activeInstanceRunning ?? raw.ActiveInstanceRunning ?? false),
        activeModelPath: String(raw.activeModelPath ?? raw.ActiveModelPath ?? ''),
        activeModelName: String(raw.activeModelName ?? raw.ActiveModelName ?? ''),
        modelLocked: Boolean(raw.modelLocked ?? raw.ModelLocked ?? false),
        connectionState: String(
          raw.connectionState ?? raw.ConnectionState ?? 'DISCONNECTED'
        ) as EtabsAgentStatus['connectionState'],
        message: String(
          raw.message ?? raw.Message ?? 'Connected to Windows Engineering Agent.'
        ),
        checkedAtUtc: String(raw.checkedAtUtc ?? raw.CheckedAtUtc ?? now),
      };
    } catch (err) {
      return {
        agentReachable: false,
        agentVersion: 'none',
        platform: 'unavailable',
        readOnlyMode: true,
        etabsInstalled: false,
        etabsV20Compatible: false,
        installedVersion: '',
        installPath: '',
        oapiDllPath: '',
        activeInstanceRunning: false,
        activeModelPath: '',
        activeModelName: '',
        modelLocked: false,
        connectionState: 'AGENT_UNAVAILABLE',
        message:
          err instanceof Error && err.name === 'AbortError'
            ? 'Timed out connecting to Windows Engineering Agent on 127.0.0.1:45820.'
            : 'Windows Engineering Agent is not running or unreachable on this host. Use the Exported ETABS Tables workflow or start Bunyan.EtabsAgent on Windows with ETABS v20.',
        checkedAtUtc: now,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async openAuthorizedModel(params: {
    modelFilePath: string;
    authorizedByUser: boolean;
  }): Promise<EtabsAgentStatus> {
    if (!params.authorizedByUser) {
      throw new Error('Opening an .EDB model requires explicit user confirmation.');
    }
    const base = validateAgentBaseUrl(this.config.agentUrl, Boolean(this.config.allowRemoteAgent));
    const target = new URL('/v1/etabs/open-model', base);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(this.config.timeoutMs, 20000));

    try {
      const response = await fetch(target.toString(), {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          ModelFilePath: params.modelFilePath,
          AuthorizedByUser: true,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error || `Agent failed to open .EDB model (HTTP ${response.status}).`);
      }
      return this.getStatus();
    } finally {
      clearTimeout(timer);
    }
  }

  async extractActiveModel(params: {
    jobId: string;
    projectId: string;
    signal?: AbortSignal;
  }): Promise<EtabsRawExtractPayload> {
    const base = validateAgentBaseUrl(this.config.agentUrl, Boolean(this.config.allowRemoteAgent));
    const target = new URL('/v1/etabs/extract', base);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(this.config.timeoutMs, 45000));
    if (params.signal) {
      params.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const response = await fetch(target.toString(), {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          JobId: params.jobId,
          ProjectId: params.projectId,
          IncludeDatabaseTableCatalog: true,
          AttachOnly: true,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(
          errBody.error || `Windows Agent extraction failed with HTTP ${response.status}.`
        );
      }
      return (await response.json()) as EtabsRawExtractPayload;
    } finally {
      clearTimeout(timer);
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const base = validateAgentBaseUrl(this.config.agentUrl, Boolean(this.config.allowRemoteAgent));
      const target = new URL('/v1/etabs/cancel', base);
      target.searchParams.set('jobId', jobId);
      const response = await fetch(target.toString(), {
        method: 'POST',
        headers: this.buildHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
