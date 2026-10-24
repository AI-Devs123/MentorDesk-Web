/**
 * JWT 认证 + 任务管理后端服务
 * 功能：
 * 1. POST /api/v1/auth/login - JWT 认证接口
 * 2. POST /api/v1/task/resume - 核准破坏性操作
 * 3. POST /api/v1/task/abort - 拒绝并回滚
 * 
 * 注意：这是 Node.js 模拟实现，真实后端使用 Spring Boot
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==================== JWT 简易实现 ====================
const JWT_SECRET = 'nexusmind-supervisor-jwt-secret-key-2026-very-secure-key';

function generateJWT(username, role) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600; // 1 小时
  const payload = {
    sub: username,
    role,
    iat: now,
    exp: now + expiresIn,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

function verifyJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');

    const [headerB64, payloadB64, signatureB64] = parts;
    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (signature !== signatureB64) {
      throw new Error('Invalid signature');
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      throw new Error('Token expired');
    }

    return payload;
  } catch (err) {
    throw new Error(`JWT verification failed: ${err.message}`);
  }
}

// ==================== 极简模拟 Redis ====================
const redisSnapshots = new Map();

// ==================== 全局 TaskContextHolder（模拟 Spring Bean） ====================
let taskContextResumeToken = null;

// ==================== 核心业务层 ====================

/**
 * DemoDestructiveService.deleteOldFile(filePath)
 * 真实文件 I/O 触发 → 物理删除沙箱文件
 */
function deleteOldFile(filePath) {
  const sandboxDir = path.join(__dirname, 'sandbox');
  const fullPath = path.join(sandboxDir, filePath);

  // 安全检查：确保只能删除 sandbox 目录内的文件
  if (!fullPath.startsWith(sandboxDir)) {
    throw new Error('Permission denied');
  }

  if (!fs.existsSync(fullPath)) {
    return `File not found or already deleted: ${filePath}`;
  }

  fs.unlinkSync(fullPath);
  return `Success: ${filePath}`;
}

/**
 * AOP 切面：比对 TaskContextHolder.resumeToken 与请求 token
 * 如果一致，放行执行；否则拒绝
 */
function validateResumeToken(providedToken) {
  if (taskContextResumeToken !== providedToken) {
    throw new Error('Token mismatch or expired');
  }
  console.log('[AOP] Token validated');
  return true;
}

/**
 * SnapshotRepository：读取并消费 Redis 快照
 * 防重放机制：读后即焚
 */
function consumeSnapshot(executionId, token) {
  const key = `snapshot:${executionId}`;
  const snapshot = redisSnapshots.get(key);

  if (!snapshot) {
    throw new Error(`Snapshot not found: ${key}`);
  }

  // 校验 Token 一致性
  if (snapshot.token !== token) {
    throw new Error('Token validation failed');
  }

  // 防重放：读后即焚
  redisSnapshots.delete(key);
  console.log(`[SnapshotRepository] Snapshot consumed: ${key}`);

  return snapshot;
}

/**
 * 主业务流程
 */
function handleResumeTask(executionId, token) {
  console.log(`\n[Controller] POST /api/v1/task/resume`);
  console.log(`  execution_id: ${executionId}`);
  console.log(`  token: ${token}`);

  const snapshot = consumeSnapshot(executionId, token);
  console.log(`  snapshot type: ${snapshot.operation_type}`);

  taskContextResumeToken = token;

  console.log('[Step 3] AOP validation...');
  validateResumeToken(token);

  console.log('[Step 4] Executing file delete...');
  const deleteResult = deleteOldFile(snapshot.filePath);
  console.log(`  ${deleteResult}`);

  taskContextResumeToken = null;

  const message = `[Supervisor] Task completed`;
  console.log(`  ${message}`);

  return {
    success: true,
    message,
    execution_id: executionId,
    deleted_file: snapshot.filePath,
  };
}

/**
 * 切片 4：拒绝与回滚
 * 销毁 Redis 快照、取消后续 DAG、返回回滚日志
 */
function handleAbortTask(executionId) {
  console.log(`\n[Controller] POST /api/v1/task/abort`);
  console.log(`  execution_id: ${executionId}`);

  const key = `snapshot:${executionId}`;
  const snapshot = redisSnapshots.get(key);

  if (!snapshot) {
    console.log(`  Snapshot not found: ${key}`);
    return {
      success: false,
      message: 'Task not found',
      execution_id: executionId,
    };
  }

  redisSnapshots.delete(key);
  console.log(`  Snapshot cleared: ${key}`);

  taskContextResumeToken = null;

  const message = `[Supervisor] Task aborted`;
  console.log(`  ${message}`);

  return {
    success: true,
    message,
    execution_id: executionId,
  };
}

// ==================== HTTP 服务器 ====================

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 跨域头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ========== 切片 0：JWT 认证端点 ==========
  if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { username, password } = payload;

        if (!username || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Missing username or password' }));
          return;
        }

        // 简易身份验证（演示用）
        let role;
        if (username === 'admin' && password === 'admin123') {
          role = 'supervisor';
        } else if (username === 'user' && password === 'user123') {
          role = 'operator';
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Invalid username or password' }));
          return;
        }

        const token = generateJWT(username, role);
        const expiresIn = 3600; // 1 小时

        console.log(`\n[AUTH] Login success | User: ${username} | Role: ${role}`);
        console.log(`[AUTH] Token: ${token.substring(0, 20)}...`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          token,
          token_type: 'Bearer',
          expires_in: expiresIn,
          username,
          role,
        }));
      } catch (err) {
        console.error(`[ERROR] ${err.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: err.message }));
      }
    });

    return;
  }

  // ========== 切片 3：核心接口 ==========
  if (pathname === '/api/v1/task/resume' && req.method === 'POST') {
    // 验证 Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Missing or invalid Authorization header' }));
      return;
    }

    try {
      const token = authHeader.substring(7); // 去掉 "Bearer "
      const claims = verifyJWT(token);
      console.log(`[AUTH] Token verified | User: ${claims.sub} | Role: ${claims.role}`);
    } catch (err) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `Token verification failed: ${err.message}` }));
      return;
    }

    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { execution_id, token } = payload;

        if (!execution_id || !token) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Missing execution_id or token' }));
          return;
        }

        const result = handleResumeTask(execution_id, token);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error(`[ERROR] ${err.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: err.message }));
      }
    });

    return;
  }

  // ========== 切片 4：拒绝与回滚接口 ==========
  if (pathname === '/api/v1/task/abort' && req.method === 'POST') {
    // 验证 Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Missing or invalid Authorization header' }));
      return;
    }

    try {
      const token = authHeader.substring(7); // 去掉 "Bearer "
      const claims = verifyJWT(token);
      console.log(`[AUTH] Token verified | User: ${claims.sub} | Role: ${claims.role}`);
    } catch (err) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `Token verification failed: ${err.message}` }));
      return;
    }

    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { execution_id } = payload;

        if (!execution_id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Missing execution_id' }));
          return;
        }

        const result = handleAbortTask(execution_id);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error(`[ERROR] ${err.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: err.message }));
      }
    });

    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// ==================== 启动服务 ====================

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║  NexusMind Supervisor Backend          ║`);
  console.log(`║  Running: http://localhost:${PORT}          ║`);
  console.log(`╚════════════════════════════════════════╝\n`);

  // 初始化沙箱目录
  const sandboxDir = path.join(__dirname, 'sandbox');
  if (!fs.existsSync(sandboxDir)) {
    fs.mkdirSync(sandboxDir, { recursive: true });
    console.log(`[Init] Sandbox created: ${sandboxDir}\n`);
  }

  // 创建测试文件
  const testFile = path.join(sandboxDir, 'old_file.py');
  if (!fs.existsSync(testFile)) {
    fs.writeFileSync(testFile, '# Test file to be deleted\nprint("I will be deleted")\n');
    console.log(`[Init] Test file created: ${testFile}\n`);
  } else {
    console.log(`[Init] Test file exists: ${testFile}\n`);
  }
});
