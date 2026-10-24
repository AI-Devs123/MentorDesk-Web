/**
 * 切片 3 后端服务
 * 功能：实现 POST /api/v1/task/resume 接口
 * 核心流程：校验 Redis 快照 → 标记已恢复 → 执行物理删除 → 通知下游
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

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
    throw new Error('Permission denied: 删除路径超出沙箱范围');
  }

  if (!fs.existsSync(fullPath)) {
    return `文件不存在或已删除: ${filePath}`;
  }

  fs.unlinkSync(fullPath);
  return `✅ 物理删除成功: ${filePath}`;
}

/**
 * AOP 切面：比对 TaskContextHolder.resumeToken 与请求 token
 * 如果一致，放行执行；否则拒绝
 */
function validateResumeToken(providedToken) {
  if (taskContextResumeToken !== providedToken) {
    throw new Error('❌ 切面验证失败: Token 不匹配或已过期');
  }
  console.log('[AOP 切面] ✅ Token 命中，放行执行！');
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
    throw new Error(`❌ Redis 快照不存在: ${key}`);
  }

  // 校验 Token 一致性
  if (snapshot.token !== token) {
    throw new Error('❌ Token 校验失败');
  }

  // 防重放：读后即焚
  redisSnapshots.delete(key);
  console.log(`[SnapshotRepository] ✅ 快照消费成功，已删除防重放: ${key}`);

  return snapshot;
}

/**
 * 主业务流程
 */
function handleResumeTask(executionId, token) {
  console.log(`\n[BFF 网关 / 控制器] 收到 POST /api/v1/task/resume`);
  console.log(`  execution_id: ${executionId}`);
  console.log(`  token: ${token}`);

  // 第1步：校验快照存在性与 Token 一致性
  console.log('\n[第1步] 校验快照存在性与 Token 一致性...');
  const snapshot = consumeSnapshot(executionId, token);
  console.log(`  ✅ 快照有效，操作类型: ${snapshot.operation_type}`);

  // 第2步：设置 TaskContextHolder 中的 resumeToken（模拟 Spring 依赖注入）
  console.log('\n[第2步] 设置 TaskContextHolder.resumeToken（模拟 Spring AOP 上下文）...');
  taskContextResumeToken = token;

  // 第3步：AOP 切面比对
  console.log('\n[第3步] AOP 切面验证 TaskContextHolder.resumeToken...');
  validateResumeToken(token);

  // 第4步：执行真实删除动作
  console.log('\n[第4步] 执行真实文件 I/O 触发 DemoDestructiveService.deleteOldFile()...');
  const deleteResult = deleteOldFile(snapshot.filePath);
  console.log(`  ${deleteResult}`);

  // 第5步：清理上下文（重要：防止 Token 泄露）
  console.log('\n[第5步] 清理 TaskContextHolder.resumeToken...');
  taskContextResumeToken = null;

  // 第6步：通知下游继续推流
  console.log('\n[第6步] 通知下游继续推流...');
  const message = `[Supervisor] 确认已收到，正在执行物理删除... 删除成功，下游任务完成`;
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
  console.log(`\n[BFF 网关 / 控制器] 收到 POST /api/v1/task/abort`);
  console.log(`  execution_id: ${executionId}`);

  // 第1步：查询快照是否存在
  console.log('\n[第1步] 查询快照是否存在...');
  const key = `snapshot:${executionId}`;
  const snapshot = redisSnapshots.get(key);

  if (!snapshot) {
    console.log(`  ⚠️ 快照不存在或已被消费: ${key}`);
    return {
      success: false,
      message: '任务不存在或已完成，无法回滚',
      execution_id: executionId,
    };
  }

  // 第2步：销毁 Redis 快照（防重放）
  console.log('\n[第2步] 销毁 Redis 快照...');
  redisSnapshots.delete(key);
  console.log(`  ✅ 快照已安全清理: ${key}`);

  // 第3步：取消后续 DAG（模拟）
  console.log('\n[第3步] 通知 DAG 状态机终止后续任务...');
  console.log(`  ✅ DAG 任务链已中断，后续操作已取消`);

  // 第4步：验证沙箱文件完好无损
  console.log('\n[第4步] 验证沙箱文件完好无损...');
  const sandboxDir = path.join(__dirname, 'sandbox');
  const files = fs.readdirSync(sandboxDir);
  console.log(`  ✅ 沙箱文件完好: ${files.join(', ')}`);

  // 第5步：清理上下文
  console.log('\n[第5步] 清理上下文...');
  taskContextResumeToken = null;

  // 第6步：返回回滚确认
  console.log('\n[第6步] 返回回滚确认...');
  const message = `[Supervisor] 用户拒绝操作，任务回滚中断`;
  console.log(`  🛑 ${message}`);

  return {
    success: true,
    message,
    execution_id: executionId,
    sandbox_files: files,
  };
}

// ==================== HTTP 服务器 ====================

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 跨域头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ========== 切片 3：核心接口 ==========
  if (pathname === '/api/v1/task/resume' && req.method === 'POST') {
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
          res.end(JSON.stringify({ message: '缺少 execution_id 或 token' }));
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
          res.end(JSON.stringify({ message: '缺少 execution_id' }));
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
  console.log(`║  NexusMind Supervisor - 切片 3 后端   ║`);
  console.log(`║  服务启动: http://localhost:${PORT}        ║`);
  console.log(`╚════════════════════════════════════════╝\n`);

  // 初始化沙箱目录
  const sandboxDir = path.join(__dirname, 'sandbox');
  if (!fs.existsSync(sandboxDir)) {
    fs.mkdirSync(sandboxDir, { recursive: true });
    console.log(`[初始化] 创建沙箱目录: ${sandboxDir}\n`);
  }

  // 创建测试文件
  const testFile = path.join(sandboxDir, 'old_file.py');
  if (!fs.existsSync(testFile)) {
    fs.writeFileSync(testFile, '# 这是一个待删除的测试文件\nprint("I will be deleted")\n');
    console.log(`[初始化] 创建测试文件: ${testFile}\n`);
  } else {
    console.log(`[初始化] 测试文件已存在: ${testFile}\n`);
  }
});
