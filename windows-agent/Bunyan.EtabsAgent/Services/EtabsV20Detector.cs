using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;

namespace Bunyan.EtabsAgent.Services
{
    public sealed class EtabsInstallationInfo
    {
        public bool Installed { get; set; }
        public bool V20Compatible { get; set; }
        public string VersionString { get; set; } = string.Empty;
        public string ExecutablePath { get; set; } = string.Empty;
        public string OapiDllPath { get; set; } = string.Empty;
        public string DetectionNotes { get; set; } = string.Empty;
    }

    public static class EtabsV20Detector
    {
        private static readonly string[] RegistryCandidatePaths =
        {
            @"SOFTWARE\Computers and Structures\ETABS\20",
            @"SOFTWARE\Computers and Structures\ETABS",
            @"SOFTWARE\WOW6432Node\Computers and Structures\ETABS\20"
        };

        public static EtabsInstallationInfo Detect(string? configuredExePath = null)
        {
            var candidates = new List<string>();
            if (!string.IsNullOrWhiteSpace(configuredExePath))
            {
                candidates.Add(configuredExePath!);
            }

            foreach (var regPath in RegistryCandidatePaths)
            {
                try
                {
                    using var key = Registry.LocalMachine.OpenSubKey(regPath);
                    var installDir = key?.GetValue("InstallDir") as string
                                     ?? key?.GetValue("Path") as string;
                    if (!string.IsNullOrWhiteSpace(installDir))
                    {
                        candidates.Add(Path.Combine(installDir!, "ETABS.exe"));
                    }
                }
                catch
                {
                    // Registry access denied or absent; continue with known installation paths.
                }
            }

            var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            if (!string.IsNullOrWhiteSpace(programFiles))
            {
                candidates.Add(Path.Combine(programFiles, "Computers and Structures", "ETABS 20", "ETABS.exe"));
                candidates.Add(Path.Combine(programFiles, "Computers and Structures", "ETABS 21", "ETABS.exe"));
                candidates.Add(Path.Combine(programFiles, "Computers and Structures", "ETABS 19", "ETABS.exe"));
            }

            foreach (var exePath in candidates)
            {
                if (!File.Exists(exePath))
                {
                    continue;
                }

                var dir = Path.GetDirectoryName(exePath) ?? string.Empty;
                var oapiDll = Path.Combine(dir, "ETABSv1.dll");
                var versionInfo = FileVersionInfo.GetVersionInfo(exePath);
                var version = versionInfo.FileVersion ?? versionInfo.ProductVersion ?? string.Empty;
                var isV20 = versionInfo.FileMajorPart == 20 || version.StartsWith("20.", StringComparison.Ordinal);

                return new EtabsInstallationInfo
                {
                    Installed = true,
                    V20Compatible = isV20 && File.Exists(oapiDll),
                    VersionString = string.IsNullOrWhiteSpace(version) ? "Unknown" : version,
                    ExecutablePath = exePath,
                    OapiDllPath = File.Exists(oapiDll) ? oapiDll : string.Empty,
                    DetectionNotes = isV20
                        ? (File.Exists(oapiDll)
                            ? "CSI ETABS v20 and ETABSv1.dll detected."
                            : "ETABS v20 executable found, but ETABSv1.dll is missing from installation directory.")
                        : $"Detected ETABS version '{version}', which is not ETABS v20."
                };
            }

            return new EtabsInstallationInfo
            {
                Installed = false,
                V20Compatible = false,
                DetectionNotes = "CSI ETABS v20 installation not found on this Windows workstation."
            };
        }
    }
}
