const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#000000",
  pixelArt: false,
  antialias: true,
  render: {
    antialias: true,
    roundPixels: false,
  },
  scene: {
    create: create,
    update: update,
  },
};

const game = new Phaser.Game(config);

// Dash constants
const DASH_DURATION = 100;
const DASH_COOLDOWN = 1000;
const DASH_SPEED_MULTIPLIER = 3;

// Enemy constants (REDs)
const RED_SPEED = 80;
const RED_RADIUS = 10;
const RED_SPAWN_INTERVAL_BASE = 1500; // milliseconds - base spawn interval
const RED_SPAWN_INTERVAL_INCREASE = 50; // milliseconds per second - how much interval increases
const RED_SHOOT_INTERVAL = 2000; // milliseconds
const RED_MIN_SHOOT_DISTANCE = 20; // pixels - REDs won't shoot if closer to player

// Enemy constants (GREENS)
const GREEN_SPEED = 60;
const GREEN_RADIUS = 12;
const GREEN_SPAWN_INTERVAL_BASE = 3000; // milliseconds - spawn less frequently
const GREEN_SPAWN_INTERVAL_INCREASE = 100; // milliseconds per second

// Bullet constants
const BULLET_SPEED = 200;
const BULLET_RADIUS = 4;

// Flash constants
const FLASH_COST = 4; // power required
const FLASH_RANGE = 150; // pixels
const FLASH_DAMAGE = 1; // triangle heart damage

const MAX_HEARTS = 3;
const MAX_POWER = 10;

class Enemy {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  move(playerPos, timeStep) {
    throw new Error("Not implemented");
  }

  action(playerPos, currentTime) {
    throw new Error("Not implemented");
  }

  collide(player) {
    throw new Error("Not implemented");
  }

  blasted(flashDamage) {
    throw new Error("Not implemented");
  }
}

class RedEnemy extends Enemy {
  constructor(x, y) {
    super(x, y);
    this.radius = RED_RADIUS;
    this.lastShotTime = 0;
  }

  render(graphics) {
    graphics.fillStyle(0xff0000, 1);
    graphics.fillCircle(this.x, this.y, this.radius);

    graphics.lineStyle(2, 0xcc0000, 1);
    graphics.strokeCircle(this.x, this.y, this.radius);

    // Draw triangle hearts for REDs (if they have any)
    const heartSize = 8;
    const heartOffset = this.radius + 5;
    drawTriangleHeart(graphics, this.x, this.y, heartSize);
  }

  collide(player) {
    const actions = [];
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < player.radius + this.radius && this.circleHearts > 0) {
      this.circleHearts--;
      // If enemy dies after consuming circle heart
      if (this.circleHearts <= 0 && this.triangleHearts <= 0) {
        actions.push(new DeadAction(100, 1));
      }
    }
    return actions;
  }

  blasted(flashDamage) {
    this.triangleHearts -= flashDamage;
    if (this.triangleHearts < 0) this.triangleHearts = 0;
    return this.circleHearts <= 0 && this.triangleHearts <= 0;
  }

  move(playerPos, timeStep) {
    const dx = playerPos.x - this.x;
    const dy = playerPos.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      const moveX = (dx / distance) * RED_SPEED * timeStep;
      const moveY = (dy / distance) * RED_SPEED * timeStep;
      this.x += moveX;
      this.y += moveY;
    }
  }

  action(playerPos, currentTime) {
    const actions = [];

    // Check if should shoot
    const dx = playerPos.x - this.x;
    const dy = playerPos.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (
      distance >= RED_MIN_SHOOT_DISTANCE &&
      currentTime - this.lastShotTime >= RED_SHOOT_INTERVAL
    ) {
      if (distance > 0) {
        const vx = (dx / distance) * BULLET_SPEED;
        const vy = (dy / distance) * BULLET_SPEED;
        const bullet = new RedBullet(this.x, this.y, vx, vy);
        actions.push(bullet);
        this.lastShotTime = currentTime;
      }
    }

    return actions;
  }
}

class GreenEnemy extends Enemy {
  constructor(x, y) {
    super(x, y);
    this.radius = GREEN_RADIUS;
    this.circleHearts = 0;
    this.triangleHearts = 2;
  }

  render(graphics) {
    const outerSize = this.radius;
    const innerSize = this.radius * 0.6;
    const sqrt3 = 0.8660254;

    // Draw outer triangle (shows when 1 or 2 hearts)
    if (this.triangleHearts >= 1) {
      graphics.fillStyle(0xffff00, 1);
      graphics.beginPath();
      graphics.moveTo(this.x, this.y - outerSize);
      graphics.lineTo(this.x - outerSize * sqrt3, this.y + outerSize * 0.5);
      graphics.lineTo(this.x + outerSize * sqrt3, this.y + outerSize * 0.5);
      graphics.closePath();
      graphics.fillPath();

      graphics.lineStyle(2, 0xcccc00, 1);
      graphics.beginPath();
      graphics.moveTo(this.x, this.y - outerSize);
      graphics.lineTo(this.x - outerSize * sqrt3, this.y + outerSize * 0.5);
      graphics.lineTo(this.x + outerSize * sqrt3, this.y + outerSize * 0.5);
      graphics.closePath();
      graphics.strokePath();
    }

    // Draw inner triangle (only shows when 2 hearts)
    if (this.triangleHearts >= 2) {
      graphics.fillStyle(0xcccc00, 1);
      graphics.beginPath();
      graphics.moveTo(this.x, this.y - innerSize);
      graphics.lineTo(this.x - innerSize * sqrt3, this.y + innerSize * 0.5);
      graphics.lineTo(this.x + innerSize * sqrt3, this.y + innerSize * 0.5);
      graphics.closePath();
      graphics.fillPath();

      graphics.lineStyle(1, 0xaaaa00, 1);
      graphics.beginPath();
      graphics.moveTo(this.x, this.y - innerSize);
      graphics.lineTo(this.x - innerSize * sqrt3, this.y + innerSize * 0.5);
      graphics.lineTo(this.x + innerSize * sqrt3, this.y + innerSize * 0.5);
      graphics.closePath();
      graphics.strokePath();
    }
  }

  collide(player) {
    const actions = [];
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Greens cannot be consumed, but they damage the player on collision
    if (distance < player.radius + this.radius) {
      actions.push(new DamageAction(1));
    }
    return actions;
  }

  blasted(flashDamage) {
    this.triangleHearts -= flashDamage;
    if (this.triangleHearts < 0) this.triangleHearts = 0;
    return this.triangleHearts <= 0;
  }

  move(playerPos, timeStep) {
    const dx = playerPos.x - this.x;
    const dy = playerPos.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      const moveX = (dx / distance) * GREEN_SPEED * timeStep;
      const moveY = (dy / distance) * GREEN_SPEED * timeStep;
      this.x += moveX;
      this.y += moveY;
    }
  }

  action(playerPos, currentTime) {
    // Greens don't shoot, return empty actions
    return [];
  }
}

class Bullet {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  render(graphics) {
    throw new Error("Not implemented");
  }

  update(playerPos, timeStep) {
    throw new Error("Not implemented");
  }
}

// Bullet Classes
class RedBullet extends Bullet {
  constructor(x, y, vx, vy) {
    super(x, y);
    this.radius = BULLET_RADIUS;
    this.vx = vx;
    this.vy = vy;
  }

  render(graphics) {
    graphics.fillStyle(0xff4444, 1);
    graphics.fillCircle(this.x, this.y, this.radius);
  }

  update(playerPos, timeStep) {
    // Bullet velocity is in pixels per second, multiply by time step
    this.x += this.vx * timeStep;
    this.y += this.vy * timeStep;
  }
}

class Actions {
  constructor() {}
}

class DeadAction {
  constructor(score, power) {
    this.score = score || 0;
    this.power = power || 0;
  }
}

class DamageAction {
  constructor(damage = 1) {
    this.type = "damage";
    this.damage = damage;
  }
}

// Player Class
class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 15;
    this.score = 0;
    this.power = 0;
    this.hearts = MAX_HEARTS;
    this.isDashing = false;
    this.dashStartTime = 0;
    this.lastDirection = { x: 0, y: 0 };
  }

  getDashEndTime() {
    return this.dashStartTime + DASH_DURATION;
  }

  render(graphics, time) {
    // Check if dash is on cooldown
    const dashEndTime = this.getDashEndTime();
    const isOnCooldown = dashEndTime > 0 && time - dashEndTime < DASH_COOLDOWN;

    // Draw player outline (light blue) - fully opaque when dash is available or initially
    // Transparent when dashing or on cooldown
    const borderAlpha = this.isDashing || isOnCooldown ? 0.4 : 1;
    graphics.lineStyle(4, 0x00ffff, borderAlpha);
    graphics.strokeCircle(this.x, this.y, this.radius);

    // Draw flash radius indicator (yellow circle with low opacity)
    // Always visible to show flash range
    graphics.lineStyle(2, 0xffff00, 0.3);
    graphics.strokeCircle(this.x, this.y, FLASH_RANGE);

    // Draw power arcs (red arcs outside the player outline)
    // MAX_POWER arcs form a complete circle when all are present
    if (this.power > 0) {
      graphics.lineStyle(2, 0xff0000, 1);
      const arcRadius = this.radius + 2;
      const arcSize = (Math.PI * 2) / MAX_POWER; // Angle per arc in radians

      for (let i = 0; i < this.power; i++) {
        // Each arc starts at a different angle
        const startAngle = i * arcSize - Math.PI / 2; // Start at top (-PI/2)
        const endAngle = startAngle + arcSize;

        // Draw arc using path
        graphics.beginPath();
        graphics.arc(this.x, this.y, arcRadius, startAngle, endAngle, false);
        graphics.strokePath();
      }
    }

    // Draw hearts in triangle configuration inside player
    // Show all 3 hearts, but make lost ones transparent
    const heartSize = 16;
    const heartOffset = 4; // Spacing
    // Top heart (heart 1)
    drawHeart(
      graphics,
      this.x,
      this.y - heartOffset,
      heartSize,
      this.hearts >= 3 ? 1 : 0.2
    );
    // Bottom left heart (heart 2)
    drawHeart(
      graphics,
      this.x - heartOffset * 1.2,
      this.y + heartOffset * 0.8,
      heartSize,
      this.hearts >= 2 ? 1 : 0.2
    );
    // Bottom right heart (heart 3)
    drawHeart(
      graphics,
      this.x + heartOffset * 1.2,
      this.y + heartOffset * 0.8,
      heartSize,
      this.hearts >= 1 ? 1 : 0.2
    );
  }
}

// Spawner Class
class Spawner {
  constructor() {
    this.lastEnemySpawn = 0;
    this.redWeight = 5;
    this.greenWeight = 2;
  }

  shouldSpawn(currentTime, spawnInterval) {
    if (this.lastEnemySpawn === 0) {
      this.lastEnemySpawn = currentTime - spawnInterval;
    }
    return currentTime - this.lastEnemySpawn >= spawnInterval;
  }

  spawn(playArea, currentTime, screenWidth = 800, screenHeight = 600) {
    // Update spawn time
    this.lastEnemySpawn = currentTime;

    // Randomly pick a side: 0=top, 1=right, 2=bottom, 3=left
    const side = Math.floor(Math.random() * 4);
    let x, y;

    switch (side) {
      case 0: // Top
        x = Math.random() * screenWidth;
        y = Math.random() * playArea.y;
        break;
      case 1: // Right
        x =
          playArea.x +
          playArea.width +
          Math.random() * (screenWidth - playArea.x - playArea.width);
        y = Math.random() * screenHeight;
        break;
      case 2: // Bottom
        x = Math.random() * screenWidth;
        y =
          playArea.y +
          playArea.height +
          Math.random() * (screenHeight - playArea.y - playArea.height);
        break;
      case 3: // Left
        x = Math.random() * playArea.x;
        y = Math.random() * screenHeight;
        break;
    }

    // Weighted random selection: 5 for red, 2 for green
    const totalWeight = this.redWeight + this.greenWeight;
    const random = Math.random() * totalWeight;

    if (random < this.redWeight) {
      return new RedEnemy(x, y);
    } else {
      return new GreenEnemy(x, y);
    }
  }
}

// Game Class
class Game {
  constructor() {
    this.player = null;
    this.enemies = [];
    this.bullets = [];
    this.startTime = 0;
    this.score = 0;
    this.spawner = new Spawner();
  }
}

// Game variables
let player;
let graphics;
let playArea = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
};

let playerSpeed = 200;
let cursors;
let cKey;
let lastDirection = { x: 0, y: 0 };
let dashStartTime = 0;
let dashEndTime = 0;
let isDashing = false;
let enemies = [];
let bullets = [];
let lastEnemySpawn = 0;
let lastGreenSpawn = 0;
let playerHearts;
let gameOver;
let gameOverText;
let resetButtonText;
let sceneRef;
let resetKey;
let score;
let scoreText;
let playerPower;
let gameStartTime = 0;

function create() {
  const scene = this;

  // Calculate playable area (75% of screen)
  const screenWidth = 800;
  const screenHeight = 600;
  playArea.width = screenWidth * 0.75;
  playArea.height = screenHeight * 0.75;
  playArea.x = (screenWidth - playArea.width) / 2;
  playArea.y = (screenHeight - playArea.height) / 2;

  graphics = this.add.graphics();

  // Create player
  player = new Player(
    playArea.x + playArea.width / 2,
    playArea.y + playArea.height / 2
  );

  // Create keyboard cursors
  cursors = this.input.keyboard.createCursorKeys();

  // Add C key for dash
  cKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);

  // Add A key for flash
  const aKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
  aKey.on("down", useFlash);

  // Add R key for reset (initialized early for game over)
  resetKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

  // Create score display at top center (in black area)
  scoreText = this.add.text(400, 30, "Score: 0", {
    fontSize: "24px",
    fontFamily: "Arial, sans-serif",
    color: "#ffffff",
    align: "center",
  });
  scoreText.setOrigin(0.5);

  // Store scene reference for game over UI
  sceneRef = this;

  // Initialize game state variables
  playerHearts = MAX_HEARTS;
  gameOver = false;
  player.score = 0;
  player.power = 0;
  enemies = [];
  bullets = [];
  lastEnemySpawn = 0;
  lastGreenSpawn = 0;
  dashStartTime = 0;
  dashEndTime = 0;
  isDashing = false;
  lastDirection = { x: 0, y: 0 };
  // gameStartTime will be set in first update call
  // Sync global score display
  setScore(player.score);
}

function setScore(newScore) {
  player.score = newScore;
  score = newScore; // Keep global for display compatibility
  if (scoreText) {
    scoreText.setText("Score: " + score);
  }
}

function addScore(points) {
  setScore(player.score + points);
}

function blast(playerPos) {
  const flashX = playerPos.x;
  const flashY = playerPos.y;

  // Damage all enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const dx = flashX - enemy.x;
    const dy = flashY - enemy.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= FLASH_RANGE) {
      if (enemy.blasted(FLASH_DAMAGE)) {
        // Create dead action with score and power
        // RedEnemy gives 100 score, GreenEnemy gives 150 score
        const score = enemy instanceof RedEnemy ? 100 : 150;
        const deadAction = new DeadAction(score, 1);
        player.score += deadAction.score;
        player.power = Math.min(player.power + deadAction.power, MAX_POWER);
        setScore(player.score);
        enemies.splice(i, 1);
      }
    }
  }
}

function collision(player) {
  // Check all enemy collisions
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const actions = enemy.collide(player);

    // Process actions
    for (const action of actions) {
      if (action instanceof DeadAction) {
        player.score += action.score;
        player.power = Math.min(player.power + action.power, MAX_POWER);
        setScore(player.score);
        enemies.splice(i, 1);
        break; // Enemy is dead, no need to process more actions
      } else if (action instanceof DamageAction) {
        playerHearts -= action.damage;
        if (playerHearts <= 0) {
          playerHearts = 0;
          gameOver = true;
          showGameOver();
        }
      }
    }
  }
}

function checkBullet(bullet, player) {
  // Check if bullet is outside the map
  const outside =
    bullet.x < -100 || bullet.x > 900 || bullet.y < -100 || bullet.y > 700;

  // Check if bullet collided with player
  const dx = player.x - bullet.x;
  const dy = player.y - bullet.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const collided = distance < player.radius + bullet.radius;

  return { outside, collided };
}

function useFlash() {
  // Check if player has enough power
  if (player.power < FLASH_COST) {
    return;
  }

  // Consume power
  player.power -= FLASH_COST;

  // Damage all enemies in range
  blast({ x: player.x, y: player.y });
}

function spawnEnemy() {
  const screenWidth = 800;
  const screenHeight = 600;

  // Randomly pick a side: 0=top, 1=right, 2=bottom, 3=left
  const side = Math.floor(Math.random() * 4);
  let x, y;

  switch (side) {
    case 0: // Top
      x = Math.random() * screenWidth;
      y = Math.random() * playArea.y;
      break;
    case 1: // Right
      x =
        playArea.x +
        playArea.width +
        Math.random() * (screenWidth - playArea.x - playArea.width);
      y = Math.random() * screenHeight;
      break;
    case 2: // Bottom
      x = Math.random() * screenWidth;
      y =
        playArea.y +
        playArea.height +
        Math.random() * (screenHeight - playArea.y - playArea.height);
      break;
    case 3: // Left
      x = Math.random() * playArea.x;
      y = Math.random() * screenHeight;
      break;
  }

  enemies.push(new RedEnemy(x, y));
}

function spawnGreen() {
  const screenWidth = 800;
  const screenHeight = 600;

  // Randomly pick a side: 0=top, 1=right, 2=bottom, 3=left
  const side = Math.floor(Math.random() * 4);
  let x, y;

  switch (side) {
    case 0: // Top
      x = Math.random() * screenWidth;
      y = Math.random() * playArea.y;
      break;
    case 1: // Right
      x =
        playArea.x +
        playArea.width +
        Math.random() * (screenWidth - playArea.x - playArea.width);
      y = Math.random() * screenHeight;
      break;
    case 2: // Bottom
      x = Math.random() * screenWidth;
      y =
        playArea.y +
        playArea.height +
        Math.random() * (screenHeight - playArea.y - playArea.height);
      break;
    case 3: // Left
      x = Math.random() * playArea.x;
      y = Math.random() * screenHeight;
      break;
  }

  enemies.push(new GreenEnemy(x, y));
}

function update(time, delta) {
  // Check for reset key
  if (gameOver && resetKey && Phaser.Input.Keyboard.JustDown(resetKey)) {
    resetGame();
    return;
  }

  if (gameOver) return;

  // Initialize game start time on first update
  if (gameStartTime === 0) {
    gameStartTime = time;
  }

  // Calculate time-based movement step (clamp delta to prevent large jumps)
  const clampedDelta = Math.min(delta, 100);
  const timeStep = clampedDelta / 1000; // Convert milliseconds to seconds

  // Calculate current spawn interval (increases linearly with time)
  const gameElapsed = (time - gameStartTime) / 1000; // Convert to seconds
  const currentSpawnInterval =
    RED_SPAWN_INTERVAL_BASE + gameElapsed * RED_SPAWN_INTERVAL_INCREASE;

  // Spawn REDs periodically (wait a bit at start)
  if (time > 500) {
    if (lastEnemySpawn === 0) {
      // Initialize spawn timer after initial delay
      lastEnemySpawn = time - currentSpawnInterval;
    }
    if (time - lastEnemySpawn >= currentSpawnInterval) {
      spawnEnemy();
      lastEnemySpawn = time;
    }
  }

  // Spawn Greens periodically
  const currentGreenSpawnInterval =
    GREEN_SPAWN_INTERVAL_BASE + gameElapsed * GREEN_SPAWN_INTERVAL_INCREASE;
  if (time > 2000) {
    // Start spawning greens after 2 seconds
    if (lastGreenSpawn === 0) {
      lastGreenSpawn = time - currentGreenSpawnInterval;
    }
    if (time - lastGreenSpawn >= currentGreenSpawnInterval) {
      spawnGreen();
      lastGreenSpawn = time;
    }
  }

  // Update dash state
  if (isDashing && time - dashStartTime >= DASH_DURATION) {
    isDashing = false;
    dashEndTime = time;
  }

  // Check for dash activation
  if (Phaser.Input.Keyboard.JustDown(cKey)) {
    const canDash =
      !isDashing && (time - dashEndTime >= DASH_COOLDOWN || dashEndTime === 0);
    if (canDash && (lastDirection.x !== 0 || lastDirection.y !== 0)) {
      isDashing = true;
      dashStartTime = time;
    }
  }

  let dx = 0;
  let dy = 0;

  // Check arrow keys
  if (cursors.left.isDown) {
    dx = -1;
  } else if (cursors.right.isDown) {
    dx = 1;
  }

  if (cursors.up.isDown) {
    dy = -1;
  } else if (cursors.down.isDown) {
    dy = 1;
  }

  // Normalize diagonal movement
  if (dx !== 0 && dy !== 0) {
    dx *= 0.707;
    dy *= 0.707;
  }

  // Update last direction if moving
  if (dx !== 0 || dy !== 0) {
    lastDirection.x = dx;
    lastDirection.y = dy;
  }

  // Calculate current speed (apply dash multiplier if dashing)
  const currentSpeed = isDashing
    ? playerSpeed * DASH_SPEED_MULTIPLIER
    : playerSpeed;

  // Calculate new position using time-based movement
  const newX = player.x + dx * currentSpeed * timeStep;
  const newY = player.y + dy * currentSpeed * timeStep;

  // Keep player within bounds
  const minX = playArea.x + player.radius;
  const maxX = playArea.x + playArea.width - player.radius;
  const minY = playArea.y + player.radius;
  const maxY = playArea.y + playArea.height - player.radius;

  player.x = Phaser.Math.Clamp(newX, minX, maxX);
  player.y = Phaser.Math.Clamp(newY, minY, maxY);

  // Update all enemies - move towards player and shoot
  const playerPos = { x: player.x, y: player.y };
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];

    // Move towards player
    enemy.move(playerPos, timeStep);

    // Get actions from enemy
    const actions = enemy.action(playerPos, time);

    // Process actions
    for (const action of actions) {
      // Check if action is a bullet (using instanceof to check if it's a bullet class)
      if (action instanceof RedBullet) {
        bullets.push(action);
      }
      // Check if action is a dead action
      else if (action instanceof DeadAction) {
        // Apply score and power from dead action
        player.score += action.score;
        player.power = Math.min(player.power + action.power, MAX_POWER);
        // Update global score display
        setScore(player.score);
        // Remove the enemy
        enemies.splice(i, 1);
        break; // Enemy is dead, no need to process more actions
      }
    }
  }

  // Check collisions after movement
  collision(player);

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];

    // Update bullet position
    bullet.update(playerPos, timeStep);

    // Check if bullet is outside or collided
    const check = checkBullet(bullet, player);

    if (check.outside) {
      // Remove bullets that are far off-screen
      bullets.splice(i, 1);
    } else if (check.collided) {
      // Hit! Remove bullet and process damage action
      bullets.splice(i, 1);
      const damageAction = new DamageAction(1);
      playerHearts -= damageAction.damage;
      if (playerHearts <= 0) {
        playerHearts = 0;
        gameOver = true;
        showGameOver();
      }
    }
  }

  // Redraw everything
  drawGame(time);
}

function drawHeart(graphics, x, y, size, alpha = 1) {
  graphics.fillStyle(0xff69b4, alpha);

  const hw = size * 0.5;
  const hh = size * 0.5;
  const topY = y - hh * 0.5;
  const midY = y;
  const bottomY = y + hh * 0.5;
  const leftX = x - hw * 0.5;
  const rightX = x + hw * 0.5;
  const leftCenterX = x - hw * 0.25;
  const rightCenterX = x + hw * 0.25;

  graphics.beginPath();
  graphics.moveTo(x, bottomY);
  graphics.lineTo(leftX, midY);
  graphics.lineTo(leftCenterX, topY);
  graphics.lineTo(x, topY + hh * 0.1);
  graphics.lineTo(rightCenterX, topY);
  graphics.lineTo(rightX, midY);
  graphics.lineTo(x, bottomY);
  graphics.closePath();
  graphics.fillPath();
}

function showGameOver() {
  // Create game over text
  gameOverText = sceneRef.add.text(400, 250, "GAME OVER", {
    fontSize: "64px",
    fontFamily: "Arial, sans-serif",
    color: "#ff0000",
    align: "center",
  });
  gameOverText.setOrigin(0.5);

  // Create reset button text
  resetButtonText = sceneRef.add.text(400, 350, "Press R to Restart", {
    fontSize: "32px",
    fontFamily: "Arial, sans-serif",
    color: "#00ffff",
    align: "center",
  });
  resetButtonText.setOrigin(0.5);
}

function resetGame() {
  // Reset game state
  gameStartTime = 0;
  playerHearts = MAX_HEARTS;
  player.power = 0;
  setScore(0);
  gameOver = false;
  enemies = [];
  bullets = [];
  lastGreenSpawn = 0;
  lastEnemySpawn = 0;
  dashStartTime = 0;
  dashEndTime = 0;
  isDashing = false;
  lastDirection = { x: 0, y: 0 };

  // Reset player position
  player.x = playArea.x + playArea.width / 2;
  player.y = playArea.y + playArea.height / 2;

  // Remove game over UI
  if (gameOverText) {
    gameOverText.destroy();
    gameOverText = null;
  }
  if (resetButtonText) {
    resetButtonText.destroy();
    resetButtonText = null;
  }
}

function drawGame(time = 0) {
  graphics.clear();

  // Draw playable area background (dark-grey, lighter black)
  graphics.fillStyle(0x1a1a1a, 1);
  graphics.fillRect(playArea.x, playArea.y, playArea.width, playArea.height);

  if (gameOver) {
    // Draw semi-transparent overlay
    graphics.fillStyle(0x000000, 0.8);
    graphics.fillRect(0, 0, 800, 600);
    // Game over text is drawn separately via sceneRef
    return;
  }

  // Draw player
  player.render(graphics, time);

  enemies.forEach((enemy) => enemy.render(graphics));
  bullets.forEach((bullet) => bullet.render(graphics));
}
