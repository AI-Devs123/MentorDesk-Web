/**
 * 递归补齐 node_modules 依赖（沙箱内 npm install 不可用时的替代方案）
 *
 * 策略：
 *  1. 从种子包出发，读它们的 dependencies + 非 optional 的 peerDependencies；
 *  2. 缺失的包：curl 取 registry packument → 选满足 range 的最高稳定版本 → curl 取 tarball → tar 解压进 node_modules；
 *  3. 新装进来的包继续入队，直到收敛。
 *
 * 仅用于本机沙箱补依赖，不进版本库。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/my/workSpaces/MentorDesk-Web';
const NM = path.join(ROOT, 'node_modules');
const TMP = path.join(ROOT, '.npmdl');
fs.mkdirSync(TMP, { recursive: true });

const packuments = new Map();

function getPackument(name) {
  if (packuments.has(name)) return packuments.get(name);
  const url = `https://registry.npmjs.org/${name.replace('/', '%2f')}`;
  const raw = execFileSync('curl', ['-fsSL', url], { maxBuffer: 128 * 1024 * 1024 }).toString();
  const j = JSON.parse(raw);
  packuments.set(name, j);
  return j;
}

const parse = (v) => v.split('.').map((x) => parseInt(x, 10) || 0);

function cmp(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function pickVersion(name, range) {
  const j = getPackument(name);
  const versions = Object.keys(j.versions).filter((v) => !v.includes('-'));
  const r = String(range || '').trim();

  let m = r.match(/^\^(\d+)\.(\d+)\.(\d+)/);
  if (m) {
    const base = `${m[1]}.${m[2]}.${m[3]}`;
    const cands = versions.filter((v) => parse(v)[0] === +m[1] && cmp(v, base) >= 0);
    if (cands.length) return cands.sort(cmp).pop();
  }

  m = r.match(/^~(\d+)\.(\d+)\.(\d+)/);
  if (m) {
    const base = `${m[1]}.${m[2]}.${m[3]}`;
    const cands = versions.filter((v) => {
      const p = parse(v);
      return p[0] === +m[1] && p[1] === +m[2] && cmp(v, base) >= 0;
    });
    if (cands.length) return cands.sort(cmp).pop();
  }

  m = r.match(/^>=?\s*(\d+\.\d+\.\d+)/);
  if (m) {
    const cands = versions.filter((v) => cmp(v, m[1]) >= 0);
    if (cands.length) return cands.sort(cmp).pop();
  }

  if (j.versions[r]) return r;
  if (!r || r === '*' || r === 'latest') return j['dist-tags'].latest;
  return j['dist-tags'].latest;
}

const installedNow = [];

function installOne(name, version) {
  const dir = path.join(NM, name);
  const url = `https://registry.npmjs.org/${name.replace('/', '%2f')}/-/${name.split('/').pop()}-${version}.tgz`;
  const tgz = path.join(TMP, `${name.replace(/[@/]/g, '_')}-${version}.tgz`);
  execFileSync('curl', ['-fsSL', '-o', tgz, url]);
  fs.mkdirSync(dir, { recursive: true });
  // 注意：tar 会把带盘符的绝对路径当成 host:path 远端地址，故用 cwd + 相对路径
  execFileSync('tar', ['-xzf', path.relative(ROOT, tgz), '-C', path.relative(ROOT, dir), '--strip-components=1'], {
    cwd: ROOT,
  });
  installedNow.push(`${name}@${version}`);
}

const readPkg = (name) => {
  const p = path.join(NM, name, 'package.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

const seeds = ['@xyflow/react', '@xyflow/system', 'zustand', 'classcat'];
const seen = new Set();
const queue = [...seeds];

while (queue.length) {
  const name = queue.shift();
  if (seen.has(name)) continue;
  seen.add(name);

  const pkg = readPkg(name);
  if (!pkg) {
    console.log(`! 跳过（未安装）${name}`);
    continue;
  }

  const meta = pkg.peerDependenciesMeta || {};
  const wanted = { ...(pkg.dependencies || {}) };
  Object.entries(pkg.peerDependencies || {}).forEach(([d, r]) => {
    if (!meta[d]?.optional) wanted[d] = r;
  });
  // react / react-dom 由项目自身提供
  delete wanted.react;
  delete wanted['react-dom'];

  Object.entries(wanted).forEach(([dep, range]) => {
    const cur = readPkg(dep);
    if (cur) {
      queue.push(dep);
      return;
    }
    const v = pickVersion(dep, range);
    console.log(`+ ${dep}@${v}   (需要于 ${name}, range=${range})`);
    installOne(dep, v);
    queue.push(dep);
  });
}

console.log(`\n完成，本次新装 ${installedNow.length} 个：`);
installedNow.forEach((s) => console.log(`  ${s}`));
