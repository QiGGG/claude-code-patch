import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';

// ─── Mach-O constants ────────────────────────────────────────────────

const MH_MAGIC_64 = 0xfeedfacf;           // little-endian 64-bit
const LC_SEGMENT_64 = 0x19;
const LC_ID_DYLIB = 0x0d;
const MH_DYLIB = 6;
const CPU_TYPE_X86_64 = 0x01000007;
const CPU_TYPE_ARM64 = 0x0100000c;

// ─── ELF constants ───────────────────────────────────────────────────

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // 7f 'E' 'L' 'F'
const ET_DYN = 3;                          // shared object
const EM_X86_64 = 62;
const EM_AARCH64 = 183;

// ─── PE constants ────────────────────────────────────────────────────

const MZ_MAGIC = Buffer.from([0x4d, 0x5a]);   // "MZ"
const PE_MAGIC = Buffer.from([0x50, 0x45, 0, 0]); // "PE\0\0"
const IMAGE_FILE_MACHINE_AMD64 = 0x8664;
const IMAGE_FILE_MACHINE_ARM64 = 0xaa64;
const IMAGE_FILE_DLL = 0x2000;

// ─── Helpers ─────────────────────────────────────────────────────────

function archName(format, cputype) {
  if (format === 'macho') {
    if (cputype === CPU_TYPE_ARM64) return 'arm64';
    if (cputype === CPU_TYPE_X86_64) return 'x64';
  }
  if (format === 'elf') {
    if (cputype === EM_AARCH64) return 'arm64';
    if (cputype === EM_X86_64) return 'x64';
  }
  if (format === 'pe') {
    if (cputype === IMAGE_FILE_MACHINE_ARM64) return 'arm64';
    if (cputype === IMAGE_FILE_MACHINE_AMD64) return 'x64';
  }
  return null;
}

function platformSuffix(format, arch) {
  const os = format === 'macho' ? 'darwin' : format === 'elf' ? 'linux' : 'win32';
  return `${arch}-${os}`;
}

// ─── Mach-O parser ───────────────────────────────────────────────────

function parseMachODylib(buf, off) {
  const magic = buf.readUInt32LE(off);
  if (magic !== MH_MAGIC_64) return null;

  const cputype = buf.readUInt32LE(off + 4);
  if (cputype !== CPU_TYPE_ARM64 && cputype !== CPU_TYPE_X86_64) return null;

  const filetype = buf.readUInt32LE(off + 12);
  if (filetype !== MH_DYLIB) return null;

  const ncmds = buf.readUInt32LE(off + 16);
  if (ncmds === 0 || ncmds > 500) return null;

  let totalFileEnd = 0;
  let installName = null;
  let cmdOff = off + 32;

  for (let i = 0; i < ncmds; i++) {
    if (cmdOff + 8 > buf.length) return null;

    const cmd = buf.readUInt32LE(cmdOff);
    const cmdsize = buf.readUInt32LE(cmdOff + 4);
    if (cmdsize === 0 || cmdsize > 65536) return null;

    if (cmd === LC_SEGMENT_64) {
      const fileoff = Number(buf.readBigUInt64LE(cmdOff + 40));
      const filesize = Number(buf.readBigUInt64LE(cmdOff + 48));
      const end = fileoff + filesize;
      if (end > totalFileEnd) totalFileEnd = end;
    } else if (cmd === LC_ID_DYLIB) {
      // dylib_command: uint32 cmd, cmdsize, str_offset, timestamp, version...
      // then name string at cmdOff + str_offset
      const strOff = buf.readUInt32LE(cmdOff + 8);
      const nameStart = cmdOff + strOff;
      const nameEnd = buf.indexOf(0, nameStart);
      if (nameEnd !== -1 && nameEnd - nameStart < 1024) {
        installName = buf.slice(nameStart, nameEnd).toString('utf8');
      }
    }

    cmdOff += cmdsize;
  }

  if (totalFileEnd === 0) return null;

  return {
    offset: off,
    size: totalFileEnd,
    arch: archName('macho', cputype),
    installName,
  };
}

function extractMachODylibs(buf) {
  const dylibs = [];
  // Magic bytes for fast indexOf scan: cf fa ed fe (MH_MAGIC_64 LE)
  const magicBytes = Buffer.from([0xcf, 0xfa, 0xed, 0xfe]);

  let off = 1;  // skip the main binary at offset 0
  while ((off = buf.indexOf(magicBytes, off)) !== -1) {
    const info = parseMachODylib(buf, off);
    if (info && off + info.size <= buf.length) {
      dylibs.push(info);
      off += info.size;  // skip past this dylib
    } else {
      off += 4;
    }
  }

  return dylibs;
}

// ─── ELF parser ──────────────────────────────────────────────────────

function parseELFSharedObject(buf, off) {
  if (buf.length - off < 64) return null;
  if (!buf.slice(off, off + 4).equals(ELF_MAGIC)) return null;

  const eiClass = buf.readUInt8(off + 4);        // 1=32-bit, 2=64-bit
  if (eiClass !== 2) return null;

  const eiData = buf.readUInt8(off + 5);         // 1=LE, 2=BE
  if (eiData !== 1) return null;                 // only LE supported

  const eType = buf.readUInt16LE(off + 16);
  if (eType !== ET_DYN) return null;

  const eMachine = buf.readUInt16LE(off + 18);
  if (eMachine !== EM_X86_64 && eMachine !== EM_AARCH64) return null;

  // ELF64 header layout:
  //   e_shoff (section header offset): off + 40 (u64)
  //   e_shentsize: off + 58 (u16)
  //   e_shnum:     off + 60 (u16)
  const shoff = Number(buf.readBigUInt64LE(off + 40));
  const shentsize = buf.readUInt16LE(off + 58);
  const shnum = buf.readUInt16LE(off + 60);

  if (shentsize !== 64 || shnum === 0 || shnum > 1000) return null;

  // Total size = shoff + shnum * shentsize (the section header table is at the end)
  const totalSize = shoff + shnum * shentsize;
  if (totalSize > buf.length - off) return null;

  return {
    offset: off,
    size: totalSize,
    arch: archName('elf', eMachine),
    installName: null,  // ELF soname requires dynamic section walk; we'll rely on adjacent strings
  };
}

function extractELFSharedObjects(buf) {
  const sos = [];

  // Scan for ELF magic; ELF headers are rare in data so 4-byte alignment is fine
  for (let off = 4; off < buf.length - 64; off += 4) {
    if (buf.readUInt8(off) !== 0x7f) continue;
    const info = parseELFSharedObject(buf, off);
    if (!info) continue;
    if (off + info.size > buf.length) continue;
    sos.push(info);
  }

  return sos;
}

// ─── PE parser ───────────────────────────────────────────────────────

function parsePEDll(buf, off) {
  if (buf.length - off < 1024) return null;
  if (!buf.slice(off, off + 2).equals(MZ_MAGIC)) return null;

  // PE header offset at MZ + 0x3c (e_lfanew)
  const peOff = buf.readUInt32LE(off + 0x3c);
  if (peOff > 4096) return null;                 // sanity

  if (off + peOff + 24 > buf.length) return null;
  if (!buf.slice(off + peOff, off + peOff + 4).equals(PE_MAGIC)) return null;

  const machine = buf.readUInt16LE(off + peOff + 4);
  if (machine !== IMAGE_FILE_MACHINE_AMD64 && machine !== IMAGE_FILE_MACHINE_ARM64) return null;

  const numberOfSections = buf.readUInt16LE(off + peOff + 6);
  const sizeOfOptionalHeader = buf.readUInt16LE(off + peOff + 20);
  const characteristics = buf.readUInt16LE(off + peOff + 22);
  if (!(characteristics & IMAGE_FILE_DLL)) return null;

  // Walk sections to find the max (PointerToRawData + SizeOfRawData)
  const sectionHeaderOff = off + peOff + 24 + sizeOfOptionalHeader;
  let totalSize = sectionHeaderOff - off;  // header area minimum

  for (let i = 0; i < numberOfSections; i++) {
    const secOff = sectionHeaderOff + i * 40;
    if (secOff + 40 > buf.length) return null;
    const sizeOfRawData = buf.readUInt32LE(secOff + 16);
    const pointerToRawData = buf.readUInt32LE(secOff + 20);
    const end = pointerToRawData + sizeOfRawData;
    if (end > totalSize) totalSize = end;
  }

  if (totalSize === 0 || totalSize > 50 * 1024 * 1024) return null;

  return {
    offset: off,
    size: totalSize,
    arch: archName('pe', machine),
    installName: null,
  };
}

function extractPEDlls(buf) {
  const dlls = [];

  for (let off = 0; off < buf.length - 1024; off++) {
    if (buf.readUInt8(off) !== 0x4d) continue;
    if (buf.readUInt8(off + 1) !== 0x5a) continue;
    const info = parsePEDll(buf, off);
    if (!info) continue;
    if (off + info.size > buf.length) continue;
    dlls.push(info);
  }

  return dlls;
}

// ─── Main dispatch ───────────────────────────────────────────────────

function detectFormat(buf) {
  if (buf.readUInt32LE(0) === MH_MAGIC_64) return 'macho';
  if (buf.slice(0, 4).equals(ELF_MAGIC)) return 'elf';
  if (buf.slice(0, 2).equals(MZ_MAGIC)) return 'pe';
  return null;
}

// Names to look for from install names / nearby strings
const KNOWN_MODULES = [
  'image-processor',
  'audio-capture',
  'computer-use-input',
  'computer-use-swift',
  'url-handler',
];

function identifyDylib(buf, dylib) {
  // 1. Try install name (most reliable)
  if (dylib.installName) {
    const base = basename(dylib.installName).replace(/\.(node|dylib|so|dll)$/, '');
    for (const m of KNOWN_MODULES) {
      if (base === m) return m;
      // Handle variants like "libcomputer_use_input.dylib"
      if (base === `lib${m.replace(/-/g, '_')}`) return m;
      if (base === `lib${m.replace(/-/g, '')}`) return m;
      if (base.toLowerCase().includes(m.replace(/-/g, ''))) return m;
    }
  }

  // 2. Scan the dylib body for known module name strings
  const body = buf.slice(dylib.offset, dylib.offset + dylib.size);
  for (const m of KNOWN_MODULES) {
    if (body.indexOf(Buffer.from(m)) !== -1) return m;
  }

  return null;
}

export function extractNativeModules(binaryPath, outputDir) {
  if (!binaryPath || !outputDir) {
    throw new Error('Usage: extractNativeModules(binaryPath, outputDir)');
  }

  if (!existsSync(binaryPath)) {
    throw new Error(`Binary not found: ${binaryPath}`);
  }

  const st = statSync(binaryPath);
  if (st.size < 10 * 1024 * 1024) {
    throw new Error(`Binary too small (${st.size} bytes) - not a native Claude Code binary`);
  }

  const buf = readFileSync(binaryPath);
  const format = detectFormat(buf);

  if (!format) {
    throw new Error('Unknown binary format (expected Mach-O / ELF / PE)');
  }

  let libs = [];
  if (format === 'macho') libs = extractMachODylibs(buf);
  else if (format === 'elf') libs = extractELFSharedObjects(buf);
  else if (format === 'pe') libs = extractPEDlls(buf);

  // Skip the first (main binary itself)
  libs = libs.filter(l => l.offset !== 0);

  mkdirSync(outputDir, { recursive: true });

  const summary = { extracted: [], skipped: [] };

  for (const lib of libs) {
    const name = identifyDylib(buf, lib);
    if (!name) {
      summary.skipped.push({ ...lib, reason: 'unidentified' });
      continue;
    }

    const platform = platformSuffix(format, lib.arch);
    const targetDir = join(outputDir, name, platform);
    mkdirSync(targetDir, { recursive: true });
    const targetFile = join(targetDir, `${name}.node`);

    const data = buf.slice(lib.offset, lib.offset + lib.size);
    writeFileSync(targetFile, data);

    summary.extracted.push({ name, platform, size: lib.size });
  }

  return summary;
}
