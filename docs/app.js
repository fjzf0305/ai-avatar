// ===================== 配置 =====================
// 你的 Cloudflare Worker 地址（部署后在 Worker 页面能看到），末尾不要带 /
const API_BASE_RAW = 'https://ai-avatar.476937123.workers.dev';
// 面包多 / 发卡平台的商品链接
const BUY_URL = 'https://example.com/你的商品链接';
// ================================================

// 自动补全 https:// 并去掉末尾的 /，防止填错
const API_BASE = (/^https?:\/\//.test(API_BASE_RAW) ? API_BASE_RAW : 'https://' + API_BASE_RAW).replace(/\/+$/, '');

const $ = (id) => document.getElementById(id);
const state = { image: null, style: null, busy: false };

$('buyLink').href = BUY_URL;
$('code').value = localStorage.getItem('avatar_code') || '';

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
}

async function api(path, body) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('连接服务器失败，请检查网络后重试');
  }
  const data = await res.json().catch(() => ({ error: '网络异常，请重试' }));
  if (!res.ok) throw Object.assign(new Error(data.error || '请求失败'), { data });
  return data;
}

// ---------- 风格选择（单选组，支持键盘方向键） ----------
// 风格按钮直接写在 index.html 里，这里只负责点击和键盘切换。
// 新增风格：在 index.html 加一个按钮，并在 worker/worker.js 的 STYLES 里加同样 id 的提示词。
function initStyles() {
  const box = $('styles');
  const btns = [...box.querySelectorAll('button')];
  btns.forEach((b) => b.addEventListener('click', () => selectStyle(b.dataset.id, true)));
  const checked = btns.find((b) => b.getAttribute('aria-checked') === 'true') || btns[0];
  if (checked) selectStyle(checked.dataset.id, false);
  box.addEventListener('keydown', (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const btns = [...box.querySelectorAll('button')];
    const idx = btns.findIndex((b) => b.dataset.id === state.style);
    const next = btns[(idx + keys[e.key] + btns.length) % btns.length];
    selectStyle(next.dataset.id, true);
  });
}

function selectStyle(id, focus) {
  state.style = id;
  for (const b of $('styles').querySelectorAll('button')) {
    const on = b.dataset.id === id;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  }
}

// ---------- 上传与压缩：长边缩到 1024px，减少上传体积 ----------
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1024;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // PNG 透明背景转 JPEG 时填白
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取这张图片，请换一张 JPG 或 PNG 照片'));
    };
    img.src = url;
  });
}

$('file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    state.image = await compressImage(file);
    $('preview').src = state.image;
    $('preview').hidden = false;
    $('uploadHint').hidden = true;
    setStatus('');
  } catch (err) {
    state.image = null;
    setStatus(err.message, true);
  }
});

// ---------- 兑换码 ----------
function getCode() {
  const code = $('code').value.trim();
  localStorage.setItem('avatar_code', code);
  return code;
}

$('checkBtn').addEventListener('click', async () => {
  const code = getCode();
  if (!code) return setStatus('请先输入兑换码', true);
  try {
    const { credits } = await api('/api/check', { code });
    setStatus(`这个兑换码还剩 ${credits} 次`);
  } catch (err) {
    setStatus(err.message, true);
  }
});

// ---------- 生成 ----------
$('genBtn').addEventListener('click', async () => {
  if (state.busy) return;
  const code = getCode();
  if (!state.image) return setStatus('请先上传一张照片', true);
  if (!code) return setStatus('请输入兑换码', true);

  state.busy = true;
  $('genBtn').disabled = true;
  $('genBtn').textContent = '生成中…';
  setStatus('AI 正在绘制，大约需要 10~60 秒，请不要关闭页面');

  try {
    const { url, credits } = await api('/api/generate', { code, style: state.style, image: state.image });
    $('resultImg').src = url;
    $('openLink').href = url;
    $('result').hidden = false;
    setStatus(`生成成功，兑换码还剩 ${credits} 次`);
    $('result').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    state.busy = false;
    $('genBtn').disabled = false;
    $('genBtn').textContent = '生成头像';
  }
});

initStyles();

// 后端地址还是占位符时提醒一下（只在本地预览或刚部署时会看到）
if (API_BASE.includes('你的子域')) {
  setStatus('提示：还没有配置后端地址，请修改 docs/app.js 顶部的 API_BASE', true);
}
