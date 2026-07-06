# Sends a file as a RAW spool job to a named Windows printer queue.
# This bypasses the driver's rendering, delivering printer-language bytes
# (PPLA/PPLB/PPLZ) untouched to the device — the standard way to print
# native label commands over USB on Windows.
param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void SendFile(string printerName, string filePath)
    {
        byte[] bytes = File.ReadAllBytes(filePath);
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            throw new Exception("OpenPrinter failed (is the printer name correct?). Win32 error " + Marshal.GetLastWin32Error());
        try
        {
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "Barcode label";
            di.pDataType = "RAW";
            if (!StartDocPrinter(hPrinter, 1, di))
                throw new Exception("StartDocPrinter failed. Win32 error " + Marshal.GetLastWin32Error());
            try
            {
                StartPagePrinter(hPrinter);
                IntPtr unmanaged = Marshal.AllocHGlobal(bytes.Length);
                try
                {
                    Marshal.Copy(bytes, 0, unmanaged, bytes.Length);
                    int written;
                    if (!WritePrinter(hPrinter, unmanaged, bytes.Length, out written))
                        throw new Exception("WritePrinter failed. Win32 error " + Marshal.GetLastWin32Error());
                    if (written != bytes.Length)
                        throw new Exception("Only " + written + " of " + bytes.Length + " bytes were written.");
                }
                finally { Marshal.FreeHGlobal(unmanaged); }
                EndPagePrinter(hPrinter);
            }
            finally { EndDocPrinter(hPrinter); }
        }
        finally { ClosePrinter(hPrinter); }
    }
}
"@

[RawPrinter]::SendFile($PrinterName, $FilePath)
Write-Output 'OK'
