/**
 * Launches the Tauri CLI with the MSVC build environment applied.
 *
 * Rust's MSVC target needs link.exe, INCLUDE and LIB from the Visual Studio C++
 * tools. This machine's Visual Studio 18 install does not provide a working
 * `vcvars64.bat`, and Git's `link.exe` shadows the MSVC linker on PATH, so the
 * environment is assembled here from vswhere + the installed toolset instead of
 * depending on shell setup. Keeping it in a wrapper means `npm run tauri build`
 * works from any terminal.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = join(projectRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

/** Runs a command and returns trimmed stdout, or null on failure. */
function output(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { encoding: 'utf8' });
    let stdout = '';
    child.stdout?.on('data', (chunk) => (stdout += chunk));
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? stdout.trim() : null));
  });
}

/** Newest semver-looking directory name, so a toolset update keeps working. */
function newestDirectory(parent) {
  if (!existsSync(parent)) return null;
  const entries = readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+(\.\d+)+/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return entries.length > 0 ? join(parent, entries[entries.length - 1]) : null;
}

/** Newest MSVC toolset that actually ships the x64 compiler and linker. */
function newestToolset(parent) {
  if (!existsSync(parent)) return null;
  const entries = readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+(\.\d+)+/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const version of entries.reverse()) {
    const root = join(parent, version);
    if (existsSync(join(root, 'bin', 'HostX64', 'x64', 'link.exe'))) return root;
  }
  return null;
}

/** Locate the Visual Studio installation that owns the C++ tools. */
async function visualStudioRoot() {
  const vswhere = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe';
  if (existsSync(vswhere)) {
    const found = await output(vswhere, [
      '-latest',
      '-products',
      '*',
      '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property',
      'installationPath',
    ]);
    if (found) return found.split(/\r?\n/)[0];
    const anyInstall = await output(vswhere, ['-latest', '-products', '*', '-property', 'installationPath']);
    if (anyInstall) return anyInstall.split(/\r?\n/)[0];
  }
  return 'C:\\Program Files\\Microsoft Visual Studio\\18\\Community';
}

/** MSVC + Windows SDK environment for an x64 Rust build. */
async function msvcEnvironment() {
  const vsRoot = await visualStudioRoot();
  const msvc = newestToolset(join(vsRoot, 'VC', 'Tools', 'MSVC'));
  const sdkRoot = 'C:\\Program Files (x86)\\Windows Kits\\10';
  const sdkVersion = newestDirectory(join(sdkRoot, 'Include'));
  if (!msvc || !sdkVersion) return null;

  const bin = join(msvc, 'bin', 'HostX64', 'x64');
  const linker = join(bin, 'link.exe');
  const sdkInclude = join(sdkVersion);
  const sdkLib = join(sdkRoot, 'Lib', sdkVersion.split('\\').pop());
  const include = [
    join(msvc, 'include'),
    join(sdkInclude, 'ucrt'),
    join(sdkInclude, 'shared'),
    join(sdkInclude, 'um'),
    join(sdkInclude, 'winrt'),
  ].join(';');
  const lib = [join(msvc, 'lib', 'x64'), join(sdkLib, 'ucrt', 'x64'), join(sdkLib, 'um', 'x64')].join(';');

  return {
    // Put the MSVC linker ahead of Git's Unix `link.exe`, which shadows it.
    PATH: `${bin};${process.env.PATH ?? ''}`,
    // Belt and braces: name the linker explicitly for the Rust MSVC target.
    CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER: linker,
    INCLUDE: include,
    LIB: lib,
  };
}

const env = (await msvcEnvironment()) ?? {};
const child = spawn(process.execPath, [cliEntry, ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: { ...process.env, ...env },
  stdio: 'inherit',
  windowsHide: false,
});
child.on('exit', (code) => process.exit(code ?? 1));
