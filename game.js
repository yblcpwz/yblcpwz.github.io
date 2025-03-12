const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let score = 0; // 初始得分
let timeLeft = 60; // 60秒

// 框子属性
const originalBasketSpeed = 0.24; // 移动速度系数（0~1，值越大移动越快）
let targetBasketX = 0; // 目标位置
let basketX = 0; // 当前实际位置
let basketWidth = 100;
let basketHeight = 60;

// 篮子帧图片
const basketFrames = [
  "assets/images/frame1.png",
  "assets/images/frame2.png",
  "assets/images/frame3.png",
];
const basketImages = []; // 存储加载后的帧图片
let currentBasketFrame = 0; // 当前帧索引
let lastFrameTime = 0; // 上一次切换帧的时间
const frameRate = 100; // 帧率（每 100ms 切换一帧）

// 游戏状态变量（时间同步）
let gameTime = 0;
let lastTime = 0; // 上一次更新的时间戳
let accumulatedTime = 0; // 累积时间差

// 游戏状态变量(秒表)
let gameStartTime = 0; // 游戏开始的时间戳
let lastwatchTime = 0; // 上次生成特殊单位的时间
let watchSpawned = 0; // 已生成的秒表数量

// 游戏状态变量（护盾）
let lastcakeTime = 0; // 上次生成特殊单位的时间
let cakeSpawned = 0; // 已生成的海棠酥数量
let isShieldActive = false; // 是否处于护盾状态
let shieldEndTime = 0; // 护盾结束时间戳

// 游戏状态变量（冰）
let isSpeedReduceActive = false; // 是否处于减速状态
let speedReduceEndTime = 0; // 减速结束时间
let basketSpeed = originalBasketSpeed; // 保存原始速度
let iceTimeStart = 0; // 冰冻起始时间
let iceTimeTotal = 0; // 冰冻总时间

// 游戏状态变量（暂停）
let isPaused = false; // 是否暂停
let savedGameState = null; // 保存游戏状态
let unitSpawnInterval = null; // 单位生成定时器
let animationFrameId = null; // 用于存储 requestAnimationFrame 的 ID
let pauseDuration = 0;
let pauseTotal = 0;

// 游戏状态变量（生成机制）
let initialSpawnInterval = 1200; // 初始生成间隔（1秒）
let normalSpawnInterval = 600; // 正常生成间隔（0.5秒）
let isInitialPhase = true; // 是否处于初始阶段（前10秒）
let bombSpawnChance = 0; // 炸弹生成概率（初始为0）
let bombCatchTimes = 0; // 接到炸弹的次数
const baseSpeed = window.innerHeight / 400;  // 根据屏幕高度调整基础速度
// 成就状态变量
const achievements = {
  A: false, // 野路子——分数130+ 胜利
  B: false, // Alter the future / 时间赛跑者——接住所有秒表
  C: false, // 接住天大鹅——接住所有六只鹅
  D: false, // 大户人家——碰到十次炸弹仍然胜利
  E: false, // 冰冻达人——冰冻时间达到33秒
};

let units = []; // 存储所有单位

// 单位类型和得分规则
const unitTypes = [
  { type: "petal", image: "assets/images/petal.png", speed: 1.5, score: 1, effect: "" },
  { type: "flower", image: "assets/images/flower.png", speed: 2.5, score: 4, effect: "" },
  { type: "bomb", image: "assets/images/bomb.png", speed: 3, score: -10, effect: "" },
  { type: "cake", image: "assets/images/cake.png", speed: 3.5, score: 4, effect: "shield" },
  { type: "watch", image: "assets/images/watch.png", speed: 3.5, score: 0, effect: "time" },
  { type: "ice", image: "assets/images/ice.png", speed: 3, score: -3, effect: "slow" },
];

function initCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  basketWidth = canvas.width * 0.2; // 根据屏幕宽度动态调整篮子大小
  basketHeight = basketWidth * 0.6; 
  targetBasketX = (canvas.width - basketWidth) / 2;
  basketX = targetBasketX;   
}
// 加载篮子帧图片
function loadBasketFrames() {
  return Promise.all(
    basketFrames.map((frame) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = frame;
        img.onload = () => {
          basketImages.push(img);
          resolve();
        };
      });
    })
  );
}

// 绘制框子
function drawBasket() {
  // 更新帧
  const currentTime = performance.now();
  if (currentTime - lastFrameTime >= frameRate) {
    currentBasketFrame = (currentBasketFrame + 1) % basketImages.length; // 切换到下一帧
    lastFrameTime = currentTime;
  }

  // 绘制当前帧
  ctx.drawImage(
    basketImages[currentBasketFrame],
    basketX,
    canvas.height - basketHeight,
    basketWidth,
    basketHeight
  );

  // 新增护盾效果绘制
  if (isShieldActive) {
    ctx.beginPath();
    ctx.arc(
      basketX + basketWidth / 2,
      canvas.height - basketHeight / 2,
      basketWidth * 0.8, // 护盾半径
      0,
      Math.PI * 2
    );
    ctx.strokeStyle = "rgba(100, 200, 255, 0.5)";
    ctx.lineWidth = 4;
    ctx.setLineDash([5, 5]); // 虚线效果
    ctx.stroke();
  }
}

// 冰-——降低移速
function activateSpeedReduce() {
  if (!isSpeedReduceActive) {
    iceTimeStart = performance.now();
  }
  isSpeedReduceActive = true;
  basketSpeed = originalBasketSpeed / 6; // 移速除以6
  speedReduceEndTime = lastTime + 4000; // 减速持续4秒
}

function activateShield() {
  isShieldActive = true;
  shieldEndTime = performance.now() + 4000; // 4秒护盾持续时间
  console.log("护盾已激活，持续4秒");
}

function createUnit() {
  // 计算游戏已进行的时间
  const currentGameTime = (performance.now() - gameStartTime - pauseTotal) / 1000;

  // 生成条件：游戏开始时间；生成数量上限；生成间隔至少10秒
  const watchsituation =
    currentGameTime >= 30 && watchSpawned < 3 && currentGameTime - lastwatchTime >= 10;

  const cakesituation =
    currentGameTime >= 15 && cakeSpawned < 6 && currentGameTime - lastcakeTime >= 7;

  // 动态调整生成间隔
  if (isInitialPhase && currentGameTime >= 10) {
    isInitialPhase = false; // 结束初始阶段
    clearInterval(unitSpawnInterval); // 清除旧定时器
    unitSpawnInterval = setInterval(createUnit, normalSpawnInterval); // 设置新定时器
  }

  // 动态调整炸弹生成概率
  if (currentGameTime >= 15 && currentGameTime < 30) {
    bombSpawnChance = 0.10; // 15-30秒生成概率为0.15
  } else if (currentGameTime >= 30) {
    bombSpawnChance = 0.2; // 30秒后生成概率为0.30
  }

  if (watchsituation && Math.random() < 0.1) {
    const unitType = unitTypes.find((u) => u.type === "watch");
    const x = Math.random() * (canvas.width - 100)+50;
    const y = 0;
    const unit = {
      type: unitType.type,
      image: new Image(),
      x: x,
      y: y,
      speed: unitType.speed,
      effect: unitType.effect,
      loaded: false,
    };
    unit.image.onload = () => (unit.loaded = true);
    unit.image.src = unitType.image;
    units.push(unit);
    watchSpawned++;
    lastwatchTime = currentGameTime;
    return; // 不在此次生成中再尝试生成其他单位
  }

  if (cakesituation && Math.random() < 0.1) {
    const unitType = unitTypes.find((u) => u.type === "cake");
    const x = Math.random() * (canvas.width - 100)+50;
    const y = 0;
    const unit = {
      type: unitType.type,
      image: new Image(),
      x: x,
      y: y,
      speed: unitType.speed,
      score: unitType.score,
      effect: unitType.effect,
      loaded: false,
    };
    unit.image.onload = () => (unit.loaded = true);
    unit.image.src = unitType.image;
    units.push(unit);
    cakeSpawned++;
    lastcakeTime = currentGameTime;
    return; // 不在此次生成中再尝试生成其他单位
  }

  // 生成炸弹的逻辑
  if (currentGameTime >= 15 && Math.random() < bombSpawnChance) {
    const unitType = unitTypes.find((u) => u.type === "bomb");
    const x = Math.random() * (canvas.width - 100)+50;
    const y = 0;
    const unit = {
      type: unitType.type,
      image: new Image(),
      x: x,
      y: y,
      speed: unitType.speed,
      score: unitType.score,
      loaded: false,
    };
    unit.image.onload = () => (unit.loaded = true);
    unit.image.src = unitType.image;
    units.push(unit);
    return; // 生成炸弹后不再生成其他单位
  }

  if (currentGameTime >= 15 && Math.random() < bombSpawnChance) {
    const unitType = unitTypes.find((u) => u.type === "ice");
    const x = Math.random() * (canvas.width - 100)+50;
    const y = 0;
    const unit = {
      type: unitType.type,
      image: new Image(),
      x: x,
      y: y,
      speed: unitType.speed,
      score: unitType.score,
      effect: unitType.effect,
      loaded: false,
    };
    unit.image.onload = () => (unit.loaded = true);
    unit.image.src = unitType.image;
    units.push(unit);
    return; // 生成后不再生成其他单位
  }

  // 生成普通单位
  const unitType = unitTypes[Math.floor(Math.random() * (unitTypes.length - 4))];
  const x = Math.random() * (canvas.width - 200);
  const y = 0;
  const unit = {
    type: unitType.type,
    image: new Image(),
    x: x,
    y: y,
    speed: unitType.speed,
    score: unitType.score,
    loaded: false,
  };
  unit.image.onload = () => (unit.loaded = true);
  unit.image.src = unitType.image;
  units.push(unit);
}

// 更新单位状态
function updateUnits() {
  for (let i = units.length - 1; i >= 0; i--) {
    const unit = units[i];
    if (!unit.loaded) continue;

    unit.y += unit.speed; // 下落（更新Y）
    const detectionOffset = canvas.width * 0.05; // 动态碰撞区域
    // 检测是否被框子接住
    if (
      unit.y + 50 >= canvas.height - basketHeight &&
      unit.x + detectionOffset >= basketX &&
      unit.x <= basketX + basketWidth + detectionOffset
    ) {
      // 炸弹处理逻辑
      if (unit.type === "bomb") {
        if (!isShieldActive) {
          // 仅在无护盾时扣分
          score += unit.score;
          bombCatchTimes++;
        }
      } else if (unit.effect === "time") {
        timeLeft += 5; // 延长5秒
        updateTimer();
      } else if (unit.effect === "slow") {
        if (!isShieldActive) {
          // 仅在无护盾时扣分
          score += unit.score;
          activateSpeedReduce();
        }
      } else if (unit.effect === "shield") {
        activateShield();
      } else {
        score += unit.score;
      }
      units.splice(i, 1);
    }

    // 如果单位超出屏幕，移除它
    if (unit.y > canvas.height) {
      units.splice(i, 1);
    }
  }
}

// 绘制单位
function drawUnits() {
  units.forEach((unit) => {
    ctx.drawImage(unit.image, unit.x, unit.y, 50, 50); // 绘制单位
  });
}

// 更新得分
function updateScore() {
  document.getElementById("score").textContent = `得分: ${score}`;
  checkAchievements(); // 新增此行
}

// 更新时间
function updateTimer() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  document.getElementById("timer").textContent = `时间: ${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// 暂停
function pauseGame() {
  isPaused = true;
  clearInterval(unitSpawnInterval); // 清除定时器
  document.getElementById("pauseMenu").style.display = "block"; // 显示暂停菜单

  // 停止 requestAnimationFrame
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // 保存游戏状态
  savedGameState = {
    score: score,
    timeLeft: timeLeft,
    basketX: basketX,
    units: units.map((unit) => ({
      type: unit.type,
      x: unit.x,
      y: unit.y,
      speed: unit.speed,
      effect: unit.effect,
      score: unit.score,
    })), // 仅保存必要属性
    isSpeedReduceActive,
    isShieldActive,
    speedReduceEndTime: isSpeedReduceActive ? speedReduceEndTime - (performance.now() - gameStartTime) : 0, // 转换为基于游戏时间的偏移
    shieldEndTime: isShieldActive ? shieldEndTime - (performance.now() - gameStartTime) : 0,
    gameStartTime,
    lastwatchTime,
    watchSpawned,
    lastcakeTime,
    cakeSpawned,
    accumulatedTime, // 保存累积时间
    lastTime: lastTime,
    pauseTime: performance.now(), // 记录暂停时的系统时间
  };
}

// 恢复暂停数据
function resumeGame() {
  try {
    if (savedGameState) {
      // 恢复单位图片和其他状态...
      units = savedGameState.units.map((unit) => {
        const newUnit = {
          ...unit,
          image: new Image(),
          loaded: false,
        };
        newUnit.image.src = unitTypes.find((u) => u.type === unit.type).image;
        newUnit.image.onload = () => (newUnit.loaded = true);
        return newUnit;
      });

      // 恢复其他状态
      score = savedGameState.score;
      timeLeft = savedGameState.timeLeft;
      basketX = savedGameState.basketX;
      isSpeedReduceActive = savedGameState.isSpeedReduceActive;
      isShieldActive = savedGameState.isShieldActive;

      speedReduceEndTime = savedGameState.isSpeedReduceActive
        ? savedGameState.speedReduceEndTime + (performance.now() - savedGameState.gameStartTime)
        : 0; // 恢复为系统时间

      shieldEndTime = savedGameState.isShieldActive
        ? savedGameState.shieldEndTime + (performance.now() - savedGameState.gameStartTime)
        : 0;

      gameStartTime = savedGameState.gameStartTime;
      lastwatchTime = savedGameState.lastwatchTime;
      watchSpawned = savedGameState.watchSpawned;
      lastcakeTime = savedGameState.lastcakeTime;
      cakeSpawned = savedGameState.cakeSpawned;
      accumulatedTime = savedGameState.accumulatedTime;
      lastTime = savedGameState.lastTime; // 恢复保存的lastTime
      pauseDuration = performance.now() - savedGameState.pauseTime;
      lastTime += pauseDuration; // 补偿暂停时间
      pauseTotal += pauseDuration;
      pauseDuration = 0; // 重置避免重复处理
    }

    // 重新启动定时器和游戏循环
    unitSpawnInterval = setInterval(createUnit, normalSpawnInterval);
    isPaused = false;
    document.getElementById("pauseMenu").style.display = "none";
    animationFrameId = requestAnimationFrame(gameLoop);
  } catch (error) {
    console.error("Error in resumeGame:", error);
  }
}

// 退出游戏
function quitGame() {
  localStorage.setItem("gameScore", score);
  window.location.href = "gongxini.html";
}

// 成就检测
function checkAchievements() {
  // A: 取得胜利
  if (!achievements.A && score <= -100 && timeLeft <= 0) {
    //&& timeLeft < 0.25 我在这里出了一些问题
    unlockAchievement("A");
  }

  // B: 秒表全接中（假设最多生成3个）
  if (!achievements.B && watchSpawned === 3 && units.filter((u) => u.type === "watch").length === 0) {
    unlockAchievement("B");
  }

  // C: 大鹅全吃到（假设最多生成6个）
  if (!achievements.C && cakeSpawned === 6 && units.filter((u) => u.type === "cake").length === 0) {
    unlockAchievement("C");
  }

  // D: 大户人家
  if (!achievements.D && score >= 130 && bombCatchTimes >= 10 && timeLeft <= 0) {
    //timeLeft < 0.25
    unlockAchievement("D");
  }

  // E：冰冻达人
  if (!achievements.E && iceTimeTotal >= 33000) {
    unlockAchievement("E");
  }
}

// 成就解锁
function unlockAchievement(type) {
  achievements[type] = true;
  saveAchievements(); // 先保存数据

  // 延迟匹配元素应对动态生成元素
  setTimeout(() => {
    const element = document.querySelector(`.achievement[data-type="${type}"]`);
    if (element) {
      element.classList.add("unlocked");
      // 显示解锁提示...
    }
  }, 100); // 100ms延迟确保元素存在
}

// 保存成就
function saveAchievements() {
  try {
    localStorage.setItem("achievements", JSON.stringify(achievements));
  } catch (e) {
    console.error("保存成就失败:", e);
  }
}

// 加载成就
function loadAchievements() {
  try {
    const saved = localStorage.getItem("gameAchievements");
    if (saved) {
      const loaded = JSON.parse(saved);
      if (loaded && typeof loaded === "object" && "A" in loaded && "B" in loaded) {
        achievements = loaded;
        // 增加延迟确保元素存在
        setTimeout(() => {
          Object.keys(achievements).forEach((type) => {
            if (achievements[type]) {
              const element = document.querySelector(`.achievement[data-type="${type}"]`);
              if (element) {
                element.classList.add("unlocked");
                // 强制样式更新（针对部分浏览器缓存问题）
                element.style.display = "none";
                element.offsetHeight; // 触发重绘
                element.style.display = "";
              }
            }
          });
        }, 50); // 50ms延迟确保动态元素加载完成
      }
    }
  } catch (e) {
    console.error("加载成就失败:", e);
    localStorage.removeItem("gameAchievements");
  }
}

// 游戏循环
function gameLoop() {
  if (isPaused) return;

  const currentTime = performance.now(); // 使用系统时间
  if (!lastTime) lastTime = currentTime;

  // 计算时间差（毫秒）
  const deltaTime = currentTime - lastTime;
  lastTime = currentTime;
  accumulatedTime += deltaTime;

  // 每累积1000毫秒（1秒）更新一次时间
  if (accumulatedTime >= 1000) {
    timeLeft--;
    accumulatedTime -= 1000;
    updateTimer();
  }

  // 减速状态检测
  if (isSpeedReduceActive && performance.now() >= speedReduceEndTime) {
    isSpeedReduceActive = false;
    basketSpeed = originalBasketSpeed;
    iceTimeTotal += performance.now() - iceTimeStart - pauseDuration;
    console.log("frozentime:", iceTimeTotal);
  }

  // 护盾状态检测
  if (isShieldActive && performance.now() >= shieldEndTime) {
    isShieldActive = false;
    console.log("护盾已失效");
  }

  // 更新框子位置
  const dx = targetBasketX - basketX;
  basketX += dx * basketSpeed;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  updateUnits();
  drawUnits();
  drawBasket();
  updateScore();

  if (timeLeft <= 0) {
    localStorage.setItem("gameScore", score);
    window.location.href = "gongxini.html";
    return;
  }

  animationFrameId = requestAnimationFrame(gameLoop);
}

// 控制框子移动
canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  // 计算目标位置（限制在画布范围内）
  targetBasketX = Math.max(0, Math.min(mouseX - basketWidth / 2, canvas.width - basketWidth));
});

// 替换原有鼠标事件为触摸事件
canvas.addEventListener("touchstart", handleTouch);
canvas.addEventListener("touchmove", handleTouch);

function handleTouch(event) {
    event.preventDefault();
    const touch = event.touches[0];
    const rect = canvas.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    targetBasketX = Math.max(0, Math.min(touchX - basketWidth/2, canvas.width - basketWidth));
}
// 页面不可见时自动暂停
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseGame();
  }
});

// 添加窗口resize事件
window.addEventListener('resize', () => {
  initCanvas();
  targetBasketX = Math.max(0, Math.min(targetBasketX, canvas.width - basketWidth));
});

// 绑定按钮事件
document.getElementById("pauseButton").addEventListener("click", pauseGame);
document.getElementById("resumeButton").addEventListener("click", resumeGame);
document.getElementById("quitButton").addEventListener("click", quitGame);
// 等待DOM就绪，在页面元素创建后立即加载成就
document.addEventListener("DOMContentLoaded", function () {
  loadAchievements();
});

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById("toggleAchievements").addEventListener("click", function() {
      const panel = document.getElementById("achievementPanel");
      panel.classList.toggle("collapsed");
      
      // 强制重绘解决过渡问题
      void panel.offsetWidth;
      
      // 更新箭头方向
      this.textContent = panel.classList.contains("collapsed") ? "▲" : "▼";
  });
});
function startGame() {
  loadAchievements(); // 加载成就
  loadBasketFrames().then(() => {
    console.log("篮子帧图片加载完成");
    gameStartTime = performance.now();
    isInitialPhase = true; // 初始阶段
    bombSpawnChance = 0; // 初始炸弹生成概率
    unitSpawnInterval = setInterval(createUnit, initialSpawnInterval); // 启动单位生成
    requestAnimationFrame(gameLoop);
  });
}

// 初始化游戏
startGame();