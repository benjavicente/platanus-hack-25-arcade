// @ts-check

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

const phaserGame = new Phaser.Game(config);

// Constants
const DASH_DURATION = 100;
const DASH_COOLDOWN = 1000;
const DASH_SPEED_MULTIPLIER = 3;

const PLAYER_SPEED = 200;

const FLASH_COST = 4;
const FLASH_RANGE = 75;
const FLASH_DAMAGE = 1;

const MAX_HEARTS = 3;
const MAX_POWER = FLASH_COST * 3;

const RED_SPEED = 80;
const RED_RADIUS = 10;
const RED_SPAWN_INTERVAL = 1500;
const RED_SPAWN_INCREASE = 50;
const RED_SHOOT_INTERVAL = 2000;
const RED_MIN_SHOOT_DISTANCE = 30;

const GREEN_RADIUS = 12;
const GREEN_SPAWN_INTERVAL = 3000;
const GREEN_SPAWN_INCREASE = 100;
const GREEN_ACC_LIMIT = 120;
const GREEN_VEL_LIMIT = 90;

const PINK_SPEED = 50;
const PINK_RADIUS = 14;
const PINK_SPAWN_INTERVAL = 4000;
const PINK_SPAWN_INCREASE = 150;

const BULLET_SPEED = 200;
const BULLET_RADIUS = 4;

class EnemySpawner {
  config = [
    {
      enemyClass: RedEnemy,
      probabilityWeight: 8,
      maxAmountOnScreen: 50,
    },
    {
      enemyClass: GreenEnemy,
      probabilityWeight: 3,
      maxAmountOnScreen: 10,
    },
    {
      enemyClass: PinkEnemy,
      probabilityWeight: 1,
      maxAmountOnScreen: 3,
    },
  ];

  getRandomEnemy(currentEnemies) {
    const totalWeight = this.config
      .filter(
        (enemy) =>
          enemy.maxAmountOnScreen >
          currentEnemies.filter((e) => e instanceof enemy.enemyClass).length
      )
      .reduce((acc, enemy) => acc + enemy.probabilityWeight, 0);

    if (totalWeight === 0) return null;

    const randomWeight = Math.random() * totalWeight;
    let cumulativeWeight = 0;
    for (const enemy of this.config) {
      cumulativeWeight += enemy.probabilityWeight;
      if (randomWeight < cumulativeWeight) {
        return enemy;
      }
    }
    throw new Error("No enemy found");
  }
}

function getSpawnConfig() {
  return {
    totalWeight: config.reduce(
      (acc, enemy) => acc + enemy.probabilityWeight,
      0
    ),
    enemies: config,
  };
}

// ========== ACTIONS ==========
class DeadAction {
  constructor(score, power) {
    this.score = score || 0;
    this.power = power || 0;
  }
}

class HealthAction {
  constructor(healthChange) {
    this.healthChange = healthChange;
  }
}

// ========== BULLET ==========
class Bullet {
  constructor(x, y, vx, vy) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = BULLET_RADIUS;
  }

  update(timeStep) {
    this.x += this.vx * timeStep;
    this.y += this.vy * timeStep;
  }

  collidesWith(player) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < player.radius + this.radius;
  }

  render(graphics) {
    graphics.fillStyle(0xff4444, 1);
    graphics.fillCircle(this.x, this.y, this.radius);
  }
}

class RedBullet extends Bullet {}

function isOffScreen(obj) {
  return obj.x < -100 || obj.x > 900 || obj.y < -100 || obj.y > 700;
}

// ========== ENEMY ==========
class Enemy {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.triangleHearts = 1;
  }

  move(playerPos, timeStep, speed) {
    throw new Error("Not implemented");
  }

  takeDamage(damage) {
    this.triangleHearts -= damage;
    return this.triangleHearts <= 0;
  }

  distanceTo(pos) {
    const dx = pos.x - this.x;
    const dy = pos.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  collidesWith(player) {
    return this.distanceTo(player) < player.radius + this.radius;
  }
}

class RedEnemy extends Enemy {
  constructor(x, y, collisionRadius = RED_RADIUS) {
    super(x, y, collisionRadius);
    this.lastShotTime = 0;
  }

  move(playerPos, timeStep) {
    const dx = playerPos.x - this.x;
    const dy = playerPos.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      this.x += (dx / distance) * RED_SPEED * timeStep;
      this.y += (dy / distance) * RED_SPEED * timeStep;
    }
  }

  getActions(playerPos, currentTime) {
    const actions = [];
    const distance = this.distanceTo(playerPos);

    if (
      distance >= RED_MIN_SHOOT_DISTANCE &&
      currentTime - this.lastShotTime >= RED_SHOOT_INTERVAL
    ) {
      const dx = playerPos.x - this.x;
      const dy = playerPos.y - this.y;
      const vx = (dx / distance) * BULLET_SPEED;
      const vy = (dy / distance) * BULLET_SPEED;
      actions.push(new RedBullet(this.x, this.y, vx, vy));
      this.lastShotTime = currentTime;
    }

    return actions;
  }

  onCollision() {
    return [new DeadAction(100, 1)];
  }

  render(graphics) {
    graphics.fillStyle(0xff0000, 1);
    graphics.fillCircle(this.x, this.y, this.radius);
    graphics.lineStyle(2, 0xcc0000, 1);
    graphics.strokeCircle(this.x, this.y, this.radius);
  }
}

class GreenEnemy extends Enemy {
  constructor(x, y, collisionRadius = GREEN_RADIUS) {
    super(x, y, collisionRadius);
    this.triangleHearts = 2;
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;
  }

  // Green enemy now uses acceleration and velocity capped to limits

  move(playerPos, timeStep) {
    // Direction to player
    const dx = playerPos.x - this.x;
    const dy = playerPos.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0) return;

    // Target acceleration towards the player
    let ax = (dx / dist) * GREEN_ACC_LIMIT;
    let ay = (dy / dist) * GREEN_ACC_LIMIT;

    // Update acceleration (can apply smoothing here if desired)
    this.ax = ax;
    this.ay = ay;

    // Update velocity
    this.vx += this.ax * timeStep;
    this.vy += this.ay * timeStep;

    // Cap velocity
    const vlen = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (vlen > GREEN_VEL_LIMIT) {
      this.vx = (this.vx / vlen) * GREEN_VEL_LIMIT;
      this.vy = (this.vy / vlen) * GREEN_VEL_LIMIT;
    }

    // Apply movement
    this.x += this.vx * timeStep;
    this.y += this.vy * timeStep;
  }

  getActions() {
    return [];
  }

  onCollision() {
    return [new HealthAction(-1), new DeadAction(0, 0)];
  }

  render(graphics) {
    const outerSize = this.radius;
    const innerSize = this.radius * 0.6;
    const sqrt3 = 0.8660254;

    // Draw green circle around the triangle
    graphics.lineStyle(2, 0x00cc00, 1);
    graphics.strokeCircle(this.x, this.y, outerSize + 4);

    // Draw green triangle outline
    graphics.lineStyle(2, 0x00cc00, 1);
    graphics.beginPath();
    graphics.moveTo(this.x, this.y - outerSize);
    graphics.lineTo(this.x - outerSize * sqrt3, this.y + outerSize * 0.5);
    graphics.lineTo(this.x + outerSize * sqrt3, this.y + outerSize * 0.5);
    graphics.closePath();
    graphics.strokePath();

    // Fill green triangle if hearts ≥ 2
    if (this.triangleHearts >= 2) {
      graphics.fillStyle(0x00cc00, 1);
      graphics.beginPath();
      graphics.moveTo(this.x, this.y - innerSize);
      graphics.lineTo(this.x - innerSize * sqrt3, this.y + innerSize * 0.5);
      graphics.lineTo(this.x + innerSize * sqrt3, this.y + innerSize * 0.5);
      graphics.closePath();
      graphics.fillPath();
    }
  }
}

class PinkEnemy extends Enemy {
  constructor(x, y, collisionRadius = PINK_RADIUS) {
    super(x, y, collisionRadius);
    this.hasShield = true;
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;
  }

  move(playerPos, timeStep, game) {
    // Reset acceleration
    this.ax = 0;
    this.ay = 0;

    // Get gravitational pull from other enemies
    let enemyPullX = 0;
    let enemyPullY = 0;
    let enemyCount = 0;

    for (const enemy of game.enemies) {
      if (enemy === this) continue;

      const dx = enemy.x - this.x;
      const dy = enemy.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 0) {
        if (enemy instanceof PinkEnemy || distance < 50) {
          enemyPullX -= dx / distance;
          enemyPullY -= dy / distance;
          enemyCount--;
        } else {
          enemyPullX += dx / distance;
          enemyPullY += dy / distance;
          enemyCount++;
        }
      }
    }

    // Average the enemy pull
    if (enemyCount > 0) {
      enemyPullX /= enemyCount;
      enemyPullY /= enemyCount;
    }

    // Vector from pink enemy to player (normalized)
    const toPlayerX = playerPos.x - this.x;
    const toPlayerY = playerPos.y - this.y;
    const distToPlayer = Math.sqrt(
      toPlayerX * toPlayerX + toPlayerY * toPlayerY
    );

    let normalizedToPlayerX = 0;
    let normalizedToPlayerY = 0;

    if (distToPlayer > 5) {
      normalizedToPlayerX = toPlayerX / distToPlayer;
      normalizedToPlayerY = toPlayerY / distToPlayer;
    }

    // Offset gravitational pull by moving away from player
    // This keeps the pink enemy behind enemy lines
    const avoidPlayerStrength = 0.3;

    this.ax = 2 * enemyPullX - normalizedToPlayerX * avoidPlayerStrength;
    this.ay = 2 * enemyPullY - normalizedToPlayerY * avoidPlayerStrength;

    // Apply acceleration to velocity with stronger multiplier
    const accelerationStrength = 300;
    this.vx += this.ax * accelerationStrength * timeStep;
    this.vy += this.ay * accelerationStrength * timeStep;

    // Apply damping to velocity for smooth movement
    const damping = 0.85;
    this.vx *= damping;
    this.vy *= damping;

    // Update position
    this.x += this.vx * timeStep;
    this.y += this.vy * timeStep;
  }

  getActions() {
    return [];
  }

  takeDamage(damage) {
    if (this.hasShield) {
      this.hasShield = false;
      return false;
    } else {
      return true;
    }
  }

  onCollision() {
    if (this.hasShield) {
      return [new HealthAction(-1), new DeadAction(0, 0)];
    } else {
      return [new HealthAction(1), new DeadAction(0, 0)];
    }
  }

  render(graphics) {
    const sqrt3 = 0.8660254;
    const triangleSize = this.radius * 0.8;

    // Draw pink circle outline
    graphics.lineStyle(2, 0xff69b4, this.hasShield ? 1 : 0.2);
    graphics.strokeCircle(this.x, this.y, this.radius);

    // Draw triangle outline (shield) if hasShield
    if (this.hasShield) {
      graphics.lineStyle(2, 0xff69b4, 1);
      graphics.beginPath();
      graphics.moveTo(this.x, this.y - triangleSize);
      graphics.lineTo(
        this.x - triangleSize * sqrt3,
        this.y + triangleSize * 0.5
      );
      graphics.lineTo(
        this.x + triangleSize * sqrt3,
        this.y + triangleSize * 0.5
      );
      graphics.closePath();
      graphics.strokePath();
    }

    // Draw heart inside
    drawHeart(graphics, this.x, this.y, this.radius * 0.8, 1);
  }
}

// ========== PLAYER ==========
class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 15;
    this.hearts = MAX_HEARTS;
    this.power = 0;
    this.score = 0;
    this.isDashing = false;
    this.lastFlashTime = 0;
    this.dashStartTime = 0;
    this.dashEndTime = 0;
    this.lastDirection = { x: 0, y: 0 };
  }

  updateMovement(cursors, time, timeStep, playArea) {
    // Update dash state
    if (this.isDashing && time - this.dashStartTime >= DASH_DURATION) {
      this.isDashing = false;
      this.dashEndTime = time;
    }

    let dx = 0;
    let dy = 0;

    if (cursors.left.isDown) dx = -1;
    else if (cursors.right.isDown) dx = 1;
    if (cursors.up.isDown) dy = -1;
    else if (cursors.down.isDown) dy = 1;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    // Update last direction
    if (dx !== 0 || dy !== 0) {
      this.lastDirection.x = dx;
      this.lastDirection.y = dy;
    }

    // Apply speed
    const currentSpeed = this.isDashing
      ? PLAYER_SPEED * DASH_SPEED_MULTIPLIER
      : PLAYER_SPEED;

    const newX = this.x + dx * currentSpeed * timeStep;
    const newY = this.y + dy * currentSpeed * timeStep;

    // Keep in bounds
    this.x = Phaser.Math.Clamp(
      newX,
      playArea.x + this.radius,
      playArea.x + playArea.width - this.radius
    );
    this.y = Phaser.Math.Clamp(
      newY,
      playArea.y + this.radius,
      playArea.y + playArea.height - this.radius
    );
  }

  tryDash(time) {
    const canDash =
      !this.isDashing &&
      (time - this.dashEndTime >= DASH_COOLDOWN || this.dashEndTime === 0);
    if (canDash && (this.lastDirection.x !== 0 || this.lastDirection.y !== 0)) {
      this.isDashing = true;
      this.dashStartTime = time;
    }
  }

  tryFlash(time) {
    if (this.power >= FLASH_COST) {
      this.power -= FLASH_COST;
      this.lastFlashTime = time;
      return true;
    }
    return false;
  }

  addScore(points) {
    this.score += points;
  }

  addPower(amount) {
    this.power = Math.min(this.power + amount, MAX_POWER);
  }

  takeDamage(damage) {
    this.hearts -= damage;
    return this.hearts <= 0;
  }

  render(graphics, time) {
    const isOnCooldown =
      this.dashEndTime > 0 && time - this.dashEndTime < DASH_COOLDOWN;
    const borderAlpha = this.isDashing || isOnCooldown ? 0.4 : 1;

    // Flash Range
    graphics.lineStyle(2, 0x00ff00, 0.1);
    graphics.strokeCircle(this.x, this.y, FLASH_RANGE);

    // if flashed in less than 0.2secs, show a flash effect with a filled circle
    if (time - this.lastFlashTime < 0.2) {
      graphics.fillStyle(0x00ff00, 0.05);
      graphics.beginPath();
      graphics.arc(this.x, this.y, FLASH_RANGE, 0, Math.PI * 2, false);
      graphics.closePath();
      graphics.fillPath();
    }

    // Player Border
    graphics.lineStyle(4, 0x00ffff, borderAlpha);
    graphics.strokeCircle(this.x, this.y, this.radius);

    // Power arcs - each circle represents one flash (FLASH_COST power units)
    for (let i = 0; i < this.power; i++) {
      const currentCircle = Math.floor(i / FLASH_COST);
      const currentSegment = i % FLASH_COST;
      const startAngle =
        (currentSegment * (Math.PI * 2)) / FLASH_COST - Math.PI / 2;
      const endAngle = startAngle + (Math.PI * 2) / FLASH_COST;
      graphics.lineStyle(2, 0x00ff00, 0.8);
      graphics.beginPath();
      graphics.arc(
        this.x,
        this.y,
        this.radius + 5 + currentCircle * 4,
        startAngle,
        endAngle,
        false
      );
      graphics.strokePath();
    }

    // Hearts
    const heartSize = 16;
    const heartOffset = 4;
    drawHeart(
      graphics,
      this.x,
      this.y - heartOffset,
      heartSize,
      this.hearts >= 3 ? 1 : 0.2
    );
    drawHeart(
      graphics,
      this.x - heartOffset * 1.2,
      this.y + heartOffset * 0.8,
      heartSize,
      this.hearts >= 2 ? 1 : 0.2
    );
    drawHeart(
      graphics,
      this.x + heartOffset * 1.2,
      this.y + heartOffset * 0.8,
      heartSize,
      this.hearts >= 1 ? 1 : 0.2
    );
  }
}

// ========== GAME OVER SCREEN ==========
class GameOverScreen {
  constructor(scene, score) {
    this.scene = scene;
    this.score = score;

    // Create dark overlay
    this.graphics = scene.add.graphics();
    this.graphics.fillStyle(0x000000, 0.8);
    this.graphics.fillRect(0, 0, 800, 600);

    // Create game over text
    this.gameOverText = scene.add.text(400, 200, "GAME OVER", {
      fontSize: "64px",
      fontFamily: "Arial, sans-serif",
      color: "#ff0000",
      align: "center",
    });
    this.gameOverText.setOrigin(0.5);

    // Create final score text
    this.scoreText = scene.add.text(400, 280, "Final Score: " + score, {
      fontSize: "32px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      align: "center",
    });
    this.scoreText.setOrigin(0.5);

    // Create reset button text
    this.resetButtonText = scene.add.text(400, 360, "Press R to Restart", {
      fontSize: "32px",
      fontFamily: "Arial, sans-serif",
      color: "#00ffff",
      align: "center",
    });
    this.resetButtonText.setOrigin(0.5);
  }

  update(time, delta, keys) {
    // Check if player wants to restart
    if (Phaser.Input.Keyboard.JustDown(keys.resetKey)) {
      return new GameScreen(this.scene);
    }
    return null;
  }

  destroy() {
    if (this.graphics) {
      this.graphics.destroy();
    }
    if (this.gameOverText) {
      this.gameOverText.destroy();
    }
    if (this.scoreText) {
      this.scoreText.destroy();
    }
    if (this.resetButtonText) {
      this.resetButtonText.destroy();
    }
  }
}

// ========== GAME SCREEN ==========
class GameScreen {
  constructor(scene) {
    this.scene = scene;
    this.playArea = { x: 100, y: 75, width: 600, height: 450 };
    this.player = new Player(
      this.playArea.x + this.playArea.width / 2,
      this.playArea.y + this.playArea.height / 2
    );
    this.enemies = [];
    this.bullets = [];

    this.startTime = 0;
    this.lastSpawnTime = 0;
    this.spawnDelay = 1;

    this.gameOver = false;
    this.graphics = scene.add.graphics();
    this.scoreText = scene.add.text(400, 30, "Score: 0", {
      fontSize: "24px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      align: "center",
    });
    this.scoreText.setOrigin(0.5);
    this.enemySpawner = new EnemySpawner();
  }

  updateSpawning(time) {
    const elapsed = (time - this.startTime) / 1000;
    if (elapsed - this.lastSpawnTime < this.spawnDelay) {
      return;
    }

    const newEnemy = this.enemySpawner.getRandomEnemy(this.enemies);

    if (!newEnemy) return;

    const { x, y } = this.getSpawnPosition();
    this.enemies.push(new newEnemy.enemyClass(x, y));
    this.lastSpawnTime = elapsed;
  }

  getSpawnPosition() {
    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0: // Top
        return {
          x: Math.random() * 800,
          y: Math.random() * this.playArea.y,
        };
      case 1: // Right
        return {
          x:
            this.playArea.x +
            this.playArea.width +
            Math.random() * (800 - this.playArea.x - this.playArea.width),
          y: Math.random() * 600,
        };
      case 2: // Bottom
        return {
          x: Math.random() * 800,
          y:
            this.playArea.y +
            this.playArea.height +
            Math.random() * (600 - this.playArea.y - this.playArea.height),
        };
      case 3: // Left
        return {
          x: Math.random() * this.playArea.x,
          y: Math.random() * 600,
        };
      default:
        throw new Error("Invalid side");
    }
  }

  updateEnemies(time, timeStep) {
    const playerPos = { x: this.player.x, y: this.player.y };

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.move(playerPos, timeStep, this);

      for (const action of enemy.getActions(playerPos, time)) {
        if (action instanceof RedBullet) {
          this.bullets.push(action);
        }
      }

      // Check collision with player
      if (enemy.collidesWith(this.player)) {
        const collisionActions = enemy.onCollision();
        this.processActions(collisionActions, i);
      }
    }
  }

  updateBullets(timeStep) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.update(timeStep);

      if (isOffScreen(bullet)) {
        this.bullets.splice(i, 1);
      } else if (bullet.collidesWith(this.player)) {
        this.bullets.splice(i, 1);
        if (this.player.takeDamage(1)) {
          this.endGame();
        }
      }
    }
  }

  processActions(actions, enemyIndex = -1) {
    for (const action of actions) {
      if (action instanceof DeadAction) {
        this.player.addScore(action.score);
        this.player.addPower(action.power);
        this.updateScoreDisplay();
        if (enemyIndex >= 0) {
          this.enemies.splice(enemyIndex, 1);
        }
        break;
      } else if (action instanceof HealthAction) {
        if (action.healthChange < 0) {
          if (this.player.takeDamage(-action.healthChange)) {
            this.endGame();
          }
        } else {
          this.player.hearts = Math.min(
            this.player.hearts + action.healthChange,
            MAX_HEARTS
          );
        }
      }
    }
  }

  flash(time) {
    if (!this.player.tryFlash(time)) return;

    const playerPos = { x: this.player.x, y: this.player.y };
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.distanceTo(playerPos) <= FLASH_RANGE) {
        if (enemy.takeDamage(FLASH_DAMAGE)) {
          const score =
            enemy instanceof RedEnemy
              ? 100
              : enemy instanceof GreenEnemy
              ? 150
              : 200;
          this.player.addScore(score);
          this.player.addPower(1);
          this.updateScoreDisplay();
          this.enemies.splice(i, 1);
        }
      }
    }
  }

  updateScoreDisplay() {
    this.scoreText.setText("Score: " + this.player.score);
  }

  endGame() {
    this.gameOver = true;
  }

  destroy() {
    if (this.graphics) {
      this.graphics.destroy();
    }
    if (this.scoreText) {
      this.scoreText.destroy();
    }

    // Clear arrays
    this.enemies = [];
    this.bullets = [];
  }

  update(time, delta, keys) {
    if (this.startTime === 0) this.startTime = time;

    const timeStep = Math.min(delta, 100) / 1000;

    if (!this.gameOver) {
      // Handle player input
      this.player.updateMovement(keys.cursors, time, timeStep, this.playArea);

      if (Phaser.Input.Keyboard.JustDown(keys.dashKey)) {
        this.player.tryDash(time);
      }

      if (Phaser.Input.Keyboard.JustDown(keys.flashKey)) {
        this.flash(time);
      }

      // Update game logic
      this.updateSpawning(time);
      this.updateEnemies(time, timeStep);
      this.updateBullets(timeStep);
    }

    this.render(time);

    // Check if game just ended and return game over screen
    if (this.gameOver) {
      return new GameOverScreen(this.scene, this.player.score);
    }

    return null;
  }

  render(time) {
    this.graphics.clear();

    // Draw play area
    this.graphics.fillStyle(0x1a1a1a, 1);
    this.graphics.fillRect(
      this.playArea.x,
      this.playArea.y,
      this.playArea.width,
      this.playArea.height
    );

    this.player.render(this.graphics, time);
    this.enemies.forEach((e) => e.render(this.graphics));
    this.bullets.forEach((b) => b.render(this.graphics));
  }
}

// ========== HELPERS ==========
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

// ========== PHASER SCENE ==========
let currentScreen;
let keys;

function create() {
  // Initialize first screen
  currentScreen = new GameScreen(this);

  // Setup input keys
  keys = {
    cursors: this.input.keyboard.createCursorKeys(),
    dashKey: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C),
    flashKey: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
    resetKey: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
  };
}

function update(time, delta) {
  // Update current screen and check for screen transition
  const nextScreen = currentScreen.update(time, delta, keys);

  // If update returns a new screen, transition to it
  if (nextScreen) {
    currentScreen.destroy();
    currentScreen = nextScreen;
  }
}
