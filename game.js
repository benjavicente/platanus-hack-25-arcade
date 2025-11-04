// @ts-check

const WIDTH = 800;
const HEIGHT = 600;
const PADDING_X = 90;
const PADDING_Y = 75;
const BACKGROUND_COLOR = "#000000";

const config = {
  type: Phaser.AUTO,
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: BACKGROUND_COLOR,
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

const PLAYER1_COLOR = 0x00ffff;
const PLAYER2_COLOR = 0xffaa00;

// Constants
const DASH_DURATION = 120;
const DASH_COOLDOWN = 900;
const DASH_SPEED_MULTIPLIER = 3;

const PLAYER_SPEED = 200;
const PLAYER_INVULNERABILITY_TIME = 750;

const HIT_SHAKE_TIME = 300;
const SHAKE_INTENSITY = 0.3;

const FLASH_COST = 4;
const FLASH_RANGE = 100;
const FLASH_DAMAGE = 1;

const MAX_HEARTS = 3;
const MAX_POWER = FLASH_COST * 3;

const RED_SPEED = 80;
const RED_RADIUS = 10;
const RED_SHOOT_INTERVAL = 2000;
const RED_MIN_SHOOT_DISTANCE = 75;
const RED_BULLET_SPEED = 200;

const GREEN_RADIUS = 12;
const GREEN_ACC_LIMIT = 120;
const GREEN_VEL_LIMIT = 90;
const GREEN_REPULSION_STRENGTH = 800;
const GREEN_REPULSION_RADIUS = 80;

const PINK_SPEED = 50;
const PINK_RADIUS = 14;
const PINK_ACC_LIMIT = 10;

const YELLOW_SPEED = 50;
const YELLOW_RADIUS = 10;
const YELLOW_SHOOT_MIN_DISTANCE = 85;
const YELLOW_SHOOT_MAX_DISTANCE = 95;
const YELLOW_SHOOT_COOLDOWN = 2000;
const YELLOW_BULLET_SPEED = 100;
const YELLOW_BULLETS_PER_SHOT = 12;

const BLUE_SPEED = 60;
const BLUE_RADIUS = 12;
const BLUE_BULLET_SPEED = 150;
const BLUE_BULLET_RADIUS = 80;

const BULLET_RADIUS = 4;

const CRT_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float time;
uniform vec2 resolution;
varying vec2 outTexCoord;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = outTexCoord;
  // Zoom: scale uv around center
  float zoom = 1.18;
  uv = (uv - 0.5) / zoom + 0.5;

  vec2 centered = uv * 2.0 - 1.0;
  float dist = dot(centered, centered);

  // Barrel distortion
  centered *= 1.0 + dist * 0.11;
  uv = centered * 0.5 + 0.5;

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 color = texture2D(uMainSampler, uv).rgb;

  // Scanlines
  float scan = sin((uv.y + time * 0.5) * resolution.y * 1.5) * 0.09;
  color -= scan;

  // Shadow mask
  float mask = sin(uv.x * resolution.x * 0.75) * 0.04;
  color += mask;

  // Flicker noise
  float noise = rand(vec2(time * 10.0, uv.y)) * 0.01;
  color += noise;

  // Vignette
  float vignette = 1.0 - dist * 0.7;
  color *= vignette;

  color = clamp(color, 0.0, 1.0);
  gl_FragColor = vec4(color, 1.0);
}`;

class CRTPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({
      game,
      name: "crtPipeline",
      fragShader: CRT_FRAGMENT_SHADER,
    });
    this._time = 0;
  }

  onPreRender() {
    this._time += this.game.loop.delta / 1000;
    this.set1f("time", this._time);
    const scale = this.game.scale;
    const width = Number(
      scale && typeof scale.width === "number"
        ? scale.width
        : this.game.config.width
    );
    const height = Number(
      scale && typeof scale.height === "number"
        ? scale.height
        : this.game.config.height
    );
    this.set2f("resolution", width, height);
  }
}

class EnemySpawner {
  config = [
    {
      enemyClass: RedEnemy,
      probabilityWeight: 100,
      maxAmountOnScreen: 50,
    },
    {
      enemyClass: GreenEnemy,
      probabilityWeight: 30,
      maxAmountOnScreen: 7,
    },
    {
      enemyClass: PinkEnemy,
      probabilityWeight: 20,
      maxAmountOnScreen: 3,
    },
    {
      enemyClass: YellowEnemy,
      probabilityWeight: 12,
      maxAmountOnScreen: 5,
    },
    {
      enemyClass: BlueEnemy,
      probabilityWeight: 8,
      maxAmountOnScreen: 6,
    },
  ];

  getRandomEnemy(currentEnemies) {
    const ajustedHeights = this.config
      .map((enemy) => ({
        ...enemy,
        count: currentEnemies.filter((e) => e instanceof enemy.enemyClass)
          .length,
      }))
      .filter((enemy) => enemy.maxAmountOnScreen > enemy.count)
      .map((enemy) => ({
        ...enemy,
        probabilityWeight:
          enemy.probabilityWeight *
          Math.sqrt(enemy.maxAmountOnScreen - enemy.count),
      }));

    if (ajustedHeights.length === 0) return null;
    const totalWeight = ajustedHeights.reduce(
      (acc, enemy) => acc + enemy.probabilityWeight,
      0
    );

    if (totalWeight === 0) return null;

    const randomWeight = Math.random() * totalWeight;
    let cumulativeWeight = 0;
    for (const enemy of ajustedHeights) {
      cumulativeWeight += enemy.probabilityWeight;
      if (randomWeight < cumulativeWeight) {
        const enemyType = this.config.find(
          (e) => e.enemyClass === enemy.enemyClass
        );
        if (enemyType) {
          enemyType.probabilityWeight = Math.max(
            1,
            enemyType.probabilityWeight * 0.98
          );
        }
        return enemy;
      }
    }
    throw new Error("No enemy found");
  }
}

// ========== ACTIONS TO THE PLAYER ==========
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
    throw new Error("Not implemented");
  }
}

class RedBullet extends Bullet {
  constructor(x, y, vx, vy) {
    super(x, y, vx, vy);
    this.radius = BULLET_RADIUS;
  }

  render(graphics) {
    graphics.fillStyle(0xff4444, 1);
    graphics.fillCircle(this.x, this.y, this.radius);
  }
}

class YellowBullet extends Bullet {
  constructor(x, y, vx, vy) {
    super(x, y, vx, vy);
    this.radius = BULLET_RADIUS;
  }

  render(graphics) {
    graphics.fillStyle(0xffff00, 1);
    graphics.fillCircle(this.x, this.y, this.radius);
  }
}

class BlueBullet extends Bullet {
  constructor(x, y, vx, vy, centerX, centerY, maxRadius) {
    super(x, y, vx, vy);
    this.radius = BULLET_RADIUS;
    this.centerX = centerX;
    this.centerY = centerY;
    this.maxRadius = maxRadius;
    this.isStopped = false;
  }

  update(timeStep) {
    if (this.isStopped) return;

    const newX = this.x + this.vx * timeStep;
    const newY = this.y + this.vy * timeStep;
    const dx = newX - this.centerX;
    const dy = newY - this.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance >= this.maxRadius) {
      // Stop at max radius
      const angle = Math.atan2(dy, dx);
      this.x = this.centerX + Math.cos(angle) * this.maxRadius;
      this.y = this.centerY + Math.sin(angle) * this.maxRadius;
      this.vx = 0;
      this.vy = 0;
      this.isStopped = true;
    } else {
      this.x = newX;
      this.y = newY;
    }
  }

  render(graphics) {
    graphics.fillStyle(0x4444ff, 1);
    graphics.fillCircle(this.x, this.y, this.radius);
    graphics.lineStyle(1, 0x6666ff, 1);
    graphics.strokeCircle(this.x, this.y, this.radius);
  }
}

function isOffScreen(obj) {
  return obj.x < -100 || obj.x > 900 || obj.y < -100 || obj.y > 700;
}

// ========== ENEMY ==========
class Enemy {
  constructor(x, y, radius, game) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.triangleHearts = 1;
    this.game = game;
  }

  move(playerPos, timeStep, speed) {
    throw new Error("Not implemented");
  }

  onFlashed() {
    throw new Error("Not implemented");
  }

  /** @param {Player} player */
  distanceTo(player) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  collidesWith(player) {
    return this.distanceTo(player) < player.radius + this.radius;
  }
}

class RedEnemy extends Enemy {
  constructor(x, y, r = RED_RADIUS, game) {
    super(x, y, r, game);
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

  /** @param {Player} player; @param {number} currentTime */
  getActions(player, currentTime) {
    const actions = [];
    const distance = this.distanceTo(player);

    if (
      distance >= RED_MIN_SHOOT_DISTANCE &&
      currentTime - this.lastShotTime >= RED_SHOOT_INTERVAL
    ) {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const vx = (dx / distance) * RED_BULLET_SPEED;
      const vy = (dy / distance) * RED_BULLET_SPEED;
      actions.push(new RedBullet(this.x, this.y, vx, vy));
      this.lastShotTime = currentTime;
    }

    return actions;
  }

  onCollision() {
    return [new DeadAction(25, 1)];
  }

  onFlashed() {
    this.triangleHearts -= FLASH_DAMAGE;
    if (this.triangleHearts <= 0) {
      return [new DeadAction(10, 0)];
    }
    return [];
  }

  render(graphics, currentTime) {
    const initialOpacity = 0.6;
    const timeSinceShot = currentTime - this.lastShotTime;
    const factor = Math.min(timeSinceShot / RED_SHOOT_INTERVAL, 1);
    const opacity = initialOpacity + (1 - initialOpacity) * Math.pow(factor, 8);

    graphics.fillStyle(0xff0000, opacity);
    graphics.fillCircle(this.x, this.y, this.radius);
    graphics.lineStyle(2, 0xcc0000, opacity);
    graphics.strokeCircle(this.x, this.y, this.radius);
  }
}

class GreenEnemy extends Enemy {
  constructor(x, y, r = GREEN_RADIUS, game) {
    super(x, y, r, game);
    this.triangleHearts = 2;
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;
  }

  // Green enemy now uses acceleration and velocity capped to limits

  move(playerPos, timeStep, game) {
    // Direction to player
    const dx = playerPos.x - this.x;
    const dy = playerPos.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0) return;

    // Target acceleration towards the player
    let ax = (dx / dist) * GREEN_ACC_LIMIT;
    let ay = (dy / dist) * GREEN_ACC_LIMIT;

    // Add repulsion from other green enemies
    for (let i = 0; i < game.enemies.length; i++) {
      const other = game.enemies[i];
      if (other !== this && other instanceof GreenEnemy) {
        const odx = this.x - other.x;
        const ody = this.y - other.y;
        const odist = Math.sqrt(odx * odx + ody * ody);

        if (odist < GREEN_REPULSION_RADIUS && odist > 0) {
          // Repulsion force inversely proportional to distance
          const repulsionForce = GREEN_REPULSION_STRENGTH / (odist * odist);
          ax += (odx / odist) * repulsionForce;
          ay += (ody / odist) * repulsionForce;
        }
      }
    }

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

  onFlashed() {
    this.triangleHearts -= FLASH_DAMAGE;
    if (this.triangleHearts <= 0) {
      return [new DeadAction(250, 0)];
    }
    return [];
  }

  onCollision() {
    return [new HealthAction(-1), new DeadAction(0, 0)];
  }

  render(graphics, currentTime) {
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
  constructor(x, y, r = PINK_RADIUS, game) {
    super(x, y, r, game);
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

    // Get gravitational pull from closest 5 enemies
    let enemyPullX = 0;
    let enemyPullY = 0;
    let enemyCount = 0;

    // Calculate distances to all enemies with a player offset
    const enemiesWithDistance = [];
    for (const enemy of game.enemies) {
      if (enemy === this) continue;

      const enemyXDistanceToPlayer = (enemy.x - playerPos.x) / 4;
      const enemyYDistanceToPlayer = (enemy.y - playerPos.y) / 4;
      const dx = enemy.x + enemyXDistanceToPlayer - this.x;
      const dy = enemy.y + enemyYDistanceToPlayer - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 0) {
        enemiesWithDistance.push({ enemy, distance, dx, dy });
      }
    }

    // Sort by distance and take closest 5
    enemiesWithDistance.sort((a, b) => a.distance - b.distance);
    const closestEnemies = enemiesWithDistance.slice(0, 3);

    // Calculate gravitational pull from closest 5 enemies
    for (const { enemy, distance, dx, dy } of closestEnemies) {
      if (enemy instanceof PinkEnemy || distance < 50) {
        enemyPullX -= dx / distance;
        enemyPullY -= dy / distance;
        enemyCount += 0.5;
      } else {
        enemyPullX += dx / distance;
        enemyPullY += dy / distance;
        enemyCount++;
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
    const avoidPlayerStrength = 0.4;

    this.ax = Math.min(
      2 * enemyPullX - normalizedToPlayerX * avoidPlayerStrength,
      PINK_ACC_LIMIT
    );
    this.ay = Math.min(
      2 * enemyPullY - normalizedToPlayerY * avoidPlayerStrength,
      PINK_ACC_LIMIT
    );

    // Apply acceleration to velocity with stronger multiplier
    const accelerationStrength = 300;
    (this.vx += this.ax * accelerationStrength * timeStep),
      (this.vy += this.ay * accelerationStrength * timeStep);

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

  onFlashed() {
    if (this.hasShield) {
      this.hasShield = false;
      return [];
    } else {
      return [new DeadAction(0, 0)];
    }
  }

  onCollision() {
    if (this.hasShield) {
      return [new HealthAction(-1), new DeadAction(0, 0)];
    } else {
      return [new HealthAction(1), new DeadAction(0, 0)];
    }
  }

  render(graphics, currentTime) {
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
    drawHeart(graphics, this.x, this.y, this.radius * 1.1, 1);
  }
}

class YellowEnemy extends Enemy {
  constructor(x, y, r = YELLOW_RADIUS, game) {
    super(x, y, r, game);
    this.lastShotTime = 0;
    this.vx = Math.sin(Math.random() * 2 * Math.PI) * YELLOW_SPEED;
    this.vy = Math.cos(Math.random() * 2 * Math.PI) * YELLOW_SPEED;
  }

  move(playerPos, timeStep) {
    // change the direction based on the player position, taking the vector
    // to the closest player, and the vector of the current position
    // (both normalized), getting the 0.7*playerVector + 0.3*currentVector
    // vector, and then normalizing the result and multiplying by YELLOW_SPEED
    const playerVector = {
      x: playerPos.x - this.x,
      y: playerPos.y - this.y,
    };
    const currentVector = {
      x: this.vx,
      y: this.vy,
    };
    const resultVector = {
      x: 0.7 * playerVector.x + 0.3 * currentVector.x,
      y: 0.7 * playerVector.y + 0.3 * currentVector.y,
    };
    const resultVectorLength = Math.sqrt(
      resultVector.x * resultVector.x + resultVector.y * resultVector.y
    );
    this.vx = (resultVector.x / resultVectorLength) * YELLOW_SPEED;
    this.vy = (resultVector.y / resultVectorLength) * YELLOW_SPEED;
    this.x += this.vx * timeStep;
    this.y += this.vy * timeStep;
  }

  /** @param {Player} player; @param {number} currentTime */
  getActions(player, currentTime) {
    const actions = [];
    const distance = this.distanceTo(player);

    if (
      distance >= YELLOW_SHOOT_MIN_DISTANCE &&
      distance <= YELLOW_SHOOT_MAX_DISTANCE &&
      currentTime - this.lastShotTime >= YELLOW_SHOOT_COOLDOWN
    ) {
      const numBullets = YELLOW_BULLETS_PER_SHOT;
      for (let i = 0; i < numBullets; i++) {
        const angle = (i / numBullets) * Math.PI * 2;
        const vx = Math.cos(angle) * YELLOW_BULLET_SPEED + this.vx;
        const vy = Math.sin(angle) * YELLOW_BULLET_SPEED + this.vy;
        actions.push(new YellowBullet(this.x, this.y, vx, vy));
      }
      this.lastShotTime = currentTime;
    }

    return actions;
  }

  onCollision() {
    return [new DeadAction(500, 4)];
  }

  onFlashed() {
    this.triangleHearts -= FLASH_DAMAGE;
    if (this.triangleHearts <= 0) {
      return [new DeadAction(50, 0)];
    }
    return [];
  }

  render(graphics, currentTime) {
    const initialOpacity = 0.6;
    const timeSinceShot = currentTime - this.lastShotTime;
    const factor = Math.min(timeSinceShot / RED_SHOOT_INTERVAL, 1);
    const opacity = initialOpacity + (1 - initialOpacity) * Math.pow(factor, 8);

    graphics.fillStyle(0xffff00, opacity);
    graphics.fillCircle(this.x, this.y, this.radius);
    graphics.lineStyle(2, 0xcccc00, opacity);
    graphics.strokeCircle(this.x, this.y, this.radius);
  }
}

class BlueEnemy extends Enemy {
  constructor(x, y, r = BLUE_RADIUS, game) {
    super(x, y, r, game);
    this.hasShield = true;
    this.targetX =
      game.playArea.x +
      0.1 * game.playArea.width +
      0.8 * game.playArea.width * Math.random();
    this.targetY =
      game.playArea.y +
      0.1 * game.playArea.height +
      0.8 * game.playArea.height * Math.random();
    this.hasReachedTarget = false;
    this.hasShot = false;
  }

  move(playerPos, timeStep, game) {
    if (!this.hasReachedTarget) {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 5) {
        this.hasReachedTarget = true;
        this.x = this.targetX;
        this.y = this.targetY;
      } else if (distance > 0) {
        this.x += (dx / distance) * BLUE_SPEED * timeStep;
        this.y += (dy / distance) * BLUE_SPEED * timeStep;
      }
    }
  }

  /** @param {Player} player; @param {number} currentTime */
  getActions(player, currentTime) {
    const actions = [];

    if (this.hasReachedTarget && !this.hasShot) {
      const numBullets = 8;
      for (let i = 0; i < numBullets; i++) {
        const angle = (i / numBullets) * Math.PI * 2;
        const vx = Math.cos(angle) * BLUE_BULLET_SPEED;
        const vy = Math.sin(angle) * BLUE_BULLET_SPEED;
        actions.push(
          new BlueBullet(
            this.x,
            this.y,
            vx,
            vy,
            this.x,
            this.y,
            BLUE_BULLET_RADIUS
          )
        );
      }
      this.hasShot = true;
    }

    return actions;
  }

  onFlashed() {
    if (this.hasShield) {
      this.hasShield = false;
      return [];
    } else {
      return [new DeadAction(150, 0)];
    }
  }

  onCollision() {
    if (this.hasShield) {
      return [new HealthAction(-1), new DeadAction(0, 0)];
    } else {
      return [new DeadAction(100, MAX_POWER)];
    }
  }

  render(graphics, currentTime) {
    const sqrt3 = 0.8660254;
    const triangleSize = this.radius * 0.8;

    // Dar small circle on tarket;
    graphics.fillStyle(0x4444ff, 0.5);
    graphics.fillCircle(this.targetX, this.targetY, 3);

    // Draw blue circle outline
    graphics.lineStyle(2, 0x4444ff, this.hasShield ? 1 : 0.2);
    graphics.strokeCircle(this.x, this.y, this.radius);

    // Draw triangle outline (shield) if hasShield
    if (this.hasShield) {
      graphics.lineStyle(2, 0x4444ff, 1);
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

    // Draw blue fill
    graphics.fillStyle(0x4444ff, this.hasShield ? 0.6 : 0.3);
    graphics.fillCircle(this.x, this.y, this.radius * 0.7);
  }
}

// ========== PLAYER ==========
class Player {
  constructor(x, y, index) {
    this.x = x;
    this.y = y;
    this.index = index;
    this.radius = 15;
    this.hearts = MAX_HEARTS;
    this.power = 0;
    this.score = 0;
    this.isDashing = false;
    this.lastFlashTime = 0;
    this.dashStartTime = 0;
    this.dashEndTime = 0;
    this.lastDirection = { x: 0, y: 0 };
    this.invulnerableUntil = 0;
  }

  updateMovement(keys, time, timeStep, playArea) {
    // Update dash state
    if (this.isDashing && time - this.dashStartTime >= DASH_DURATION) {
      this.isDashing = false;
      this.dashEndTime = time;
    }

    let dx = 0;
    let dy = 0;

    if (keys.left.isDown) dx = -1;
    else if (keys.right.isDown) dx = 1;
    if (keys.up.isDown) dy = -1;
    else if (keys.down.isDown) dy = 1;

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

  isInvulnerable(time) {
    return time < this.invulnerableUntil;
  }

  takeDamage(damage, currentTime) {
    this.hearts -= damage;
    this.invulnerableUntil = currentTime + PLAYER_INVULNERABILITY_TIME; // 1 second invulnerability
    return this.hearts <= 0;
  }

  render(graphics, time) {
    if (this.hearts <= 0) return;

    const isOnCooldown =
      this.dashEndTime > 0 && time - this.dashEndTime < DASH_COOLDOWN;
    const borderAlpha = this.isDashing || isOnCooldown ? 0.4 : 1;

    // Different colors for each player
    const playerColor = this.index === 1 ? PLAYER1_COLOR : PLAYER2_COLOR;

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
    graphics.lineStyle(4, playerColor, borderAlpha);
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
    const heartSize = 17;
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

// ========== TITLE SCREEN ==========
class TitleScreen {
  constructor(scene) {
    this.scene = scene;

    audioSystem.playTitleMusic();

    this.background = scene.add.rectangle(
      400,
      300,
      WIDTH,
      HEIGHT,
      BACKGROUND_COLOR
    );

    this.frame = scene.add.graphics();
    this.frame.lineStyle(6, 0x00ffff, 0.4);
    this.frame.strokeRect(
      PADDING_X,
      PADDING_Y,
      WIDTH - PADDING_X * 2,
      HEIGHT - PADDING_Y * 2
    );

    this.titleText = scene.add.text(400, 280, "close corners", {
      fontSize: "72px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      align: "center",
      fontStyle: "bold",
    });
    this.titleText.setOrigin(0.5);

    this.promptText = scene.add.text(400, 340, "Press SPACE to begin", {
      fontSize: "28px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      align: "center",
    });
    this.promptText.setOrigin(0.5);

    const leaderboard = getLeaderboard();
    const topScore = leaderboard[0];
    const highScoreText = topScore
      ? `High Score: ${topScore.name.trim()} - ${topScore.score}`
      : "High Score: 0";
    this.highScoreText = scene.add.text(400, 420, highScoreText, {
      fontSize: "28px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      align: "center",
    });
    this.highScoreText.setOrigin(0.5);
    this.highScoreText.setAlpha(0.5);

    this.controlsTextP1 = scene.add.text(
      250,
      500,
      "P1: WASD + V dash + C flash",
      {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: `#${PLAYER1_COLOR.toString(16).padStart(6, "0")}`,
      }
    );
    this.controlsTextP1.setOrigin(0.5);

    this.controlsTextP2 = scene.add.text(
      550,
      500,
      "P2: Arrows + K dash + L flash",
      {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: `#${PLAYER2_COLOR.toString(16).padStart(6, "0")}`,
      }
    );
    this.controlsTextP2.setOrigin(0.5);

    this.promptTween = scene.tweens.add({
      targets: this.promptText,
      alpha: { from: 0.2, to: 1 },
      duration: 900,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  update(time, delta, keys) {
    if (Phaser.Input.Keyboard.JustDown(keys.startKey)) {
      return new GameScreen(this.scene);
    }
    return null;
  }

  destroy() {
    this.promptTween.stop();
    this.background.destroy();
    this.frame.destroy();
    this.titleText.destroy();
    this.promptText.destroy();
    this.controlsTextP1.destroy();
    this.controlsTextP2.destroy();
    this.highScoreText.destroy();
  }
}

// ========== GAME OVER SCREEN ==========
class GameOverScreen {
  constructor(scene, player1Score, player2Score) {
    this.scene = scene;
    this.player1Score = player1Score;
    this.player2Score = player2Score;

    // Generate unique IDs for both players
    const timestamp = Date.now();
    const random1 = Math.floor(Math.random() * 10000);
    const random2 = Math.floor(Math.random() * 10000);
    this.player1Id = `${timestamp}-1-${random1}`;
    this.player2Id = `${timestamp}-2-${random2}`;

    // Check if scores qualify for leaderboard and add them
    this.player1InLeaderboard = addScoreToLeaderboard(
      player1Score,
      lastPlayer1Name,
      this.player1Id
    );
    this.player2InLeaderboard = addScoreToLeaderboard(
      player2Score,
      lastPlayer2Name,
      this.player2Id
    );

    // Name input state for both players - use last saved names
    this.player1Name = lastPlayer1Name.split("");
    this.player2Name = lastPlayer2Name.split("");
    this.player1CharPos = 0;
    this.player2CharPos = 0;

    // Track key states for input handling
    this.lastP1UpDown = 0;
    this.lastP1Dash = 0;
    this.lastP2UpDown = 0;
    this.lastP2Dash = 0;

    // Start game over music
    audioSystem.playGameOverMusic();

    // Create all UI elements
    this.graphics = scene.add.graphics();
    this.textObjects = [];
    this.leaderboardTextObjects = [];
    this.createUI();

    this.resetButtonTween = scene.tweens.add({
      targets: this.resetButtonText,
      alpha: { from: 0.2, to: 1 },
      duration: 900,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  createUI() {
    const scene = this.scene;

    // Dark overlay
    this.graphics.fillStyle(0x000000, 0.85);
    this.graphics.fillRect(0, 0, 800, 600);

    // Game Over title
    this.gameOverText = scene.add.text(400, 120, "GAME OVER", {
      fontSize: "48px",
      fontFamily: "Arial, sans-serif",
      color: "#ff0000",
      align: "center",
      fontStyle: "bold",
    });
    this.gameOverText.setOrigin(0.5);
    this.textObjects.push(this.gameOverText);

    // Player 1 section (left column)
    const p1X = 250;
    const p1Y = 200;

    if (this.player1InLeaderboard) {
      // Name input for P1
      this.player1NameText = scene.add.text(
        p1X,
        p1Y,
        this.getFormattedName(1),
        {
          fontSize: "32px",
          fontFamily: "monospace",
          color: `#${PLAYER1_COLOR.toString(16).padStart(6, "0")}`,
          align: "center",
        }
      );
      this.player1NameText.setOrigin(0.5);
      this.textObjects.push(this.player1NameText);
    }

    // P1 Score
    this.player1ScoreText = scene.add.text(
      p1X,
      p1Y + 40,
      `P1: ${this.player1Score}`,
      {
        fontSize: "24px",
        fontFamily: "Arial, sans-serif",
        color: `#${PLAYER1_COLOR.toString(16).padStart(6, "0")}`,
        align: "center",
      }
    );
    this.player1ScoreText.setOrigin(0.5);
    this.textObjects.push(this.player1ScoreText);

    // Player 2 section (right column)
    const p2X = 550;
    const p2Y = p1Y;

    if (this.player2InLeaderboard) {
      // Name input for P2
      this.player2NameText = scene.add.text(
        p2X,
        p2Y,
        this.getFormattedName(2),
        {
          fontSize: "32px",
          fontFamily: "monospace",
          color: `#${PLAYER2_COLOR.toString(16).padStart(6, "0")}`,
          align: "center",
        }
      );
      this.player2NameText.setOrigin(0.5);
      this.textObjects.push(this.player2NameText);
    }

    // P2 Score
    this.player2ScoreText = scene.add.text(
      p2X,
      p2Y + 40,
      `P2: ${this.player2Score}`,
      {
        fontSize: "24px",
        fontFamily: "Arial, sans-serif",
        color: `#${PLAYER2_COLOR.toString(16).padStart(6, "0")}`,
        align: "center",
      }
    );
    this.player2ScoreText.setOrigin(0.5);
    this.textObjects.push(this.player2ScoreText);

    // Top 10 section
    const leaderboardY = 250;

    // Render leaderboard in 2 columns
    this.renderLeaderboard(leaderboardY + 35);

    // Restart button
    this.resetButtonText = scene.add.text(400, 450, "Press SPACE to Restart", {
      fontSize: "24px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      align: "center",
    });
    this.resetButtonText.setOrigin(0.5);
    this.textObjects.push(this.resetButtonText);
  }

  renderLeaderboard(startY) {
    const leaderboard = getLeaderboard();
    const leftX = 160;
    const rightX = 460;
    const lineHeight = 24;

    for (let i = 0; i < 10; i++) {
      const entry = leaderboard[i];
      const rank = i + 1;
      const isLeftColumn = i < 5;
      const x = isLeftColumn ? leftX : rightX;
      const y = startY + (isLeftColumn ? i : i - 5) * lineHeight;

      const rankPrefix = rank.toString().padStart(2, " ");

      if (entry) {
        // Determine color based on whether this is from the last game
        let color = "#cccccc";
        if (entry.id === this.player1Id) {
          color = `#${PLAYER1_COLOR.toString(16).padStart(6, "0")}`;
        } else if (entry.id === this.player2Id) {
          color = `#${PLAYER2_COLOR.toString(16).padStart(6, "0")}`;
        }

        const text = `${rankPrefix}. ${
          entry.name === "   " ? "???" : entry.name
        } - ${entry.score}`;
        const entryText = this.scene.add.text(x, y, text, {
          fontSize: "18px",
          fontFamily: "monospace",
          color: color,
          align: "left",
        });
        this.leaderboardTextObjects.push(entryText);
      } else {
        const text = `${rankPrefix}. --- - 0`;
        const entryText = this.scene.add.text(x, y, text, {
          fontSize: "18px",
          fontFamily: "monospace",
          color: "#444444",
          align: "left",
        });
        this.leaderboardTextObjects.push(entryText);
      }
    }
  }

  updateLeaderboard() {
    // Clear existing leaderboard text objects
    for (const textObj of this.leaderboardTextObjects) {
      textObj.destroy();
    }
    this.leaderboardTextObjects = [];

    // Re-render the leaderboard
    const leaderboardY = 250;
    this.renderLeaderboard(leaderboardY + 35);
  }

  getFormattedName(player) {
    const name = player === 1 ? this.player1Name : this.player2Name;
    const pos = player === 1 ? this.player1CharPos : this.player2CharPos;

    // Format with brackets to show current position
    // Replace spaces with underscores for display
    let formatted = "";
    for (let i = 0; i < 3; i++) {
      const displayChar = name[i] === " " ? "_" : name[i];
      if (i === pos) {
        formatted += `[${displayChar}]`;
      } else {
        formatted += ` ${displayChar} `;
      }
    }
    return formatted;
  }

  cycleCharacter(player, direction) {
    const name = player === 1 ? this.player1Name : this.player2Name;
    const pos = player === 1 ? this.player1CharPos : this.player2CharPos;

    // Get current character code (space=32, A=65, Z=90)
    let charCode = name[pos].charCodeAt(0);

    // If current char is not in range, default to space
    if (charCode < 32 || (charCode > 32 && charCode < 65) || charCode > 90) {
      charCode = 32;
    }

    // Move to next/previous character
    if (direction > 0) {
      // Moving forward: space -> A -> ... -> Z -> space
      if (charCode === 32) {
        charCode = 65; // space -> A
      } else if (charCode === 90) {
        charCode = 32; // Z -> space
      } else {
        charCode += 1; // A -> B -> ... -> Z
      }
    } else {
      // Moving backward: space -> Z -> ... -> A -> space
      if (charCode === 32) {
        charCode = 90; // space -> Z
      } else if (charCode === 65) {
        charCode = 32; // A -> space
      } else {
        charCode -= 1; // Z -> Y -> ... -> A
      }
    }

    name[pos] = String.fromCharCode(charCode);

    // Update leaderboard immediately
    const id = player === 1 ? this.player1Id : this.player2Id;
    const fullName = name.join("");
    updateLeaderboardName(id, fullName);

    // Update global saved names
    if (player === 1) {
      lastPlayer1Name = fullName;
    } else {
      lastPlayer2Name = fullName;
    }

    // Update display
    this.updateNameDisplay(player);
    this.updateLeaderboard();
  }

  moveToNextPosition(player) {
    if (player === 1) {
      this.player1CharPos = (this.player1CharPos + 1) % 3;
    } else {
      this.player2CharPos = (this.player2CharPos + 1) % 3;
    }
    this.updateNameDisplay(player);
  }

  updateNameDisplay(player) {
    if (player === 1 && this.player1NameText) {
      this.player1NameText.setText(this.getFormattedName(1));
    } else if (player === 2 && this.player2NameText) {
      this.player2NameText.setText(this.getFormattedName(2));
    }
  }

  update(time, delta, keys) {
    // Handle Player 1 name input (only if in leaderboard)
    if (this.player1InLeaderboard) {
      // W/S to cycle characters
      if (keys.player1.up.isDown && time - this.lastP1UpDown > 150) {
        this.cycleCharacter(1, 1);
        this.lastP1UpDown = time;
      } else if (keys.player1.down.isDown && time - this.lastP1UpDown > 150) {
        this.cycleCharacter(1, -1);
        this.lastP1UpDown = time;
      }

      // V to move to next position
      if (Phaser.Input.Keyboard.JustDown(keys.player1.dash)) {
        this.moveToNextPosition(1);
      }
    }

    // Handle Player 2 name input (only if in leaderboard)
    if (this.player2InLeaderboard) {
      // Up/Down to cycle characters
      if (keys.player2.up.isDown && time - this.lastP2UpDown > 150) {
        this.cycleCharacter(2, 1);
        this.lastP2UpDown = time;
      } else if (keys.player2.down.isDown && time - this.lastP2UpDown > 150) {
        this.cycleCharacter(2, -1);
        this.lastP2UpDown = time;
      }

      // K to move to next position
      if (Phaser.Input.Keyboard.JustDown(keys.player2.dash)) {
        this.moveToNextPosition(2);
      }
    }

    // Check if player wants to start a new game
    if (Phaser.Input.Keyboard.JustDown(keys.startKey)) {
      return new GameScreen(this.scene);
    }
    return null;
  }

  destroy() {
    this.graphics.destroy();
    for (const textObj of this.textObjects) {
      textObj.destroy();
    }
    for (const textObj of this.leaderboardTextObjects) {
      textObj.destroy();
    }
    this.resetButtonTween.destroy();
  }
}

// ========== GAME SCREEN ==========
class GameScreen {
  constructor(scene) {
    this.scene = scene;
    this.playArea = {
      x: PADDING_X,
      y: PADDING_Y,
      width: WIDTH - PADDING_X * 2,
      height: HEIGHT - PADDING_Y * 2,
    };

    // Create 2 players at different positions
    this.players = [
      new Player(
        this.playArea.x + this.playArea.width / 3,
        this.playArea.y + this.playArea.height / 2,
        1
      ),
      new Player(
        this.playArea.x + (this.playArea.width * 2) / 3,
        this.playArea.y + this.playArea.height / 2,
        2
      ),
    ];

    this.enemies = [];
    this.bullets = [];

    this.startTime = 0;
    this.lastSpawnTime = 0;
    this.spawnDelay = 1;

    this.gameOver = false;
    this.graphics = scene.add.graphics();
    this.lastHitAt = 0;

    // Score displays for both players
    this.scoreTexts = [
      scene.add.text(180, 60, "P1: 0", {
        fontSize: "24px",
        fontFamily: "Arial, sans-serif",
        color: "#00ffff",
        align: "center",
      }),
      scene.add.text(620, 60, "P2: 0", {
        fontSize: "24px",
        fontFamily: "Arial, sans-serif",
        color: "#ffaa00",
        align: "center",
      }),
    ];
    this.timeText = scene.add.text(WIDTH / 2, HEIGHT - PADDING_Y + 18, "0:00", {
      fontSize: "24px",
      fontFamily: "Arial, sans-serif",
      align: "center",
      color: "#808080",
    });
    this.timeText.setOrigin(0.5);

    this.scoreTexts[0].setOrigin(0.5);
    this.scoreTexts[1].setOrigin(0.5);

    this.enemySpawner = new EnemySpawner();

    // Start game music
    audioSystem.playGameMusic();
  }

  updateSpawning(time) {
    const elapsed = (time - this.startTime) / 1000;
    if (elapsed - this.lastSpawnTime < this.spawnDelay) {
      return;
    }

    const newEnemy = this.enemySpawner.getRandomEnemy(this.enemies);

    if (!newEnemy) return;
    this.spawnDelay = Math.max(0.1, this.spawnDelay - 0.003);

    const { x, y } = this.getSpawnPosition();
    this.enemies.push(new newEnemy.enemyClass(x, y, undefined, this));
    this.lastSpawnTime = elapsed;
  }

  getSpawnPosition() {
    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0: // Top
        return {
          x: Math.random() * WIDTH,
          y: 0,
        };
      case 1: // Right
        return {
          x: WIDTH,
          y: Math.random() * HEIGHT,
        };
      case 2: // Bottom
        return {
          x: Math.random() * WIDTH,
          y: HEIGHT,
        };
      case 3: // Left
        return {
          x: 0,
          y: Math.random() * HEIGHT,
        };
      default:
        throw new Error("Invalid side");
    }
  }

  updateEnemies(time, timeStep) {
    // Get nearest player for each enemy
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      // Find closest player that's alive
      let targetPlayer = null;
      let minDist = Infinity;

      for (const player of this.players) {
        if (player.hearts > 0) {
          const dist = enemy.distanceTo(player);
          if (dist < minDist) {
            minDist = dist;
            targetPlayer = player;
          }
        }
      }

      // If no player is alive, just pick the first player
      if (!targetPlayer) {
        targetPlayer = this.players[0];
      }

      enemy.move(targetPlayer, timeStep, this);

      for (const action of enemy.getActions(targetPlayer, time)) {
        if (action instanceof Bullet) {
          this.bullets.push(action);
          // Play bullet fire sound
          audioSystem.playBulletSound();
        }
      }

      // Check collision with all players
      for (const player of this.players) {
        if (enemy.collidesWith(player) && player.hearts > 0) {
          const collisionActions = enemy.onCollision();
          this.processActions(collisionActions, player, i, time);
          break; // Only process collision with one player
        }
      }
    }
  }

  updateBullets(timeStep, time) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.update(timeStep);

      if (isOffScreen(bullet)) {
        this.bullets.splice(i, 1);
      } else {
        // Check collision with all players
        let hitPlayer = false;
        for (const player of this.players) {
          if (
            bullet.collidesWith(player) &&
            player.hearts > 0 &&
            !player.isInvulnerable(time)
          ) {
            this.bullets.splice(i, 1);
            // Play hit sound when player takes damage
            audioSystem.playHitSound();
            this.lastHitAt = time;
            player.takeDamage(1, time);
            this.checkGameOver();
            hitPlayer = true;
            break;
          }
        }
      }
    }
  }

  processActions(actions, player, enemyIndex = -1, time = 0) {
    for (const action of actions) {
      if (action instanceof DeadAction) {
        // Play capture sound if enemy gave score (was killed)
        if (action.score > 0) {
          audioSystem.playCaptureSound();
        }
        player.addScore(action.score);
        player.addPower(action.power);
        this.updateScoreDisplay();
        if (enemyIndex >= 0) {
          this.enemies.splice(enemyIndex, 1);
        }
        break;
      } else if (action instanceof HealthAction) {
        if (action.healthChange < 0) {
          // Skip damage if player is invulnerable
          if (!player.isInvulnerable(time)) {
            // Play hit sound when player takes damage
            audioSystem.playHitSound();
            this.lastHitAt = time;
            player.takeDamage(-action.healthChange, time);
            this.checkGameOver();
          }
        } else {
          const newHearts = Math.min(
            player.hearts + action.healthChange,
            MAX_HEARTS
          );
          if (newHearts > player.hearts) {
            audioSystem.playHeartSound();
          }
          player.hearts = newHearts;
        }
      }
    }
  }

  flash(player, time) {
    if (!player.tryFlash(time)) return;

    // Play flash sound effect
    audioSystem.playFlashSound();

    const playerPos = { x: player.x, y: player.y };
    const rangeSq = FLASH_RANGE * FLASH_RANGE;
    let enemiesKilled = 0;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.distanceTo(playerPos) <= FLASH_RANGE) {
        const actions = enemy.onFlashed();
        if (actions.length > 0) {
          this.processActions(actions, player, i);
          enemiesKilled++;
        }
      }
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      const dx = bullet.x - player.x;
      const dy = bullet.y - player.y;
      if (dx * dx + dy * dy <= rangeSq) {
        this.bullets.splice(i, 1);
      }
    }
    // Play capture sound if any enemies were killed
    if (enemiesKilled > 0) {
      audioSystem.playCaptureSound();
    }
  }

  updateScoreDisplay() {
    for (let i = 0; i < this.players.length; i++) {
      this.scoreTexts[i].setText("P" + (i + 1) + ": " + this.players[i].score);
    }
  }

  checkGameOver() {
    // Game ends when both players are dead
    const allDead = this.players.every((player) => player.hearts <= 0);
    if (allDead) {
      this.gameOver = true;
    }
  }

  destroy() {
    this.graphics.destroy();
    this.timeText.destroy();
    for (const scoreText of this.scoreTexts) {
      scoreText.destroy();
    }
  }

  update(time, delta, keys) {
    if (this.startTime === 0) this.startTime = time;

    const timeStep = Math.min(delta, 100) / 1000;

    const elapsed = (time - this.startTime) / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = Math.floor(elapsed % 60);
    this.timeText.setText(minutes + ":" + seconds.toString().padStart(2, "0"));

    if (!this.gameOver) {
      // Handle player 1 input (WASD + C for dash + V for flash)
      if (this.players[0].hearts > 0) {
        this.players[0].updateMovement(
          keys.player1,
          time,
          timeStep,
          this.playArea
        );

        if (Phaser.Input.Keyboard.JustDown(keys.player1.dash)) {
          this.players[0].tryDash(time);
        }

        if (Phaser.Input.Keyboard.JustDown(keys.player1.flash)) {
          this.flash(this.players[0], time);
        }
      }

      // Handle player 2 input (Arrow keys + K for dash + L for flash)
      if (this.players[1].hearts > 0) {
        this.players[1].updateMovement(
          keys.player2,
          time,
          timeStep,
          this.playArea
        );

        if (Phaser.Input.Keyboard.JustDown(keys.player2.dash)) {
          this.players[1].tryDash(time);
        }

        if (Phaser.Input.Keyboard.JustDown(keys.player2.flash)) {
          this.flash(this.players[1], time);
        }
      }

      // Update game logic
      this.updateSpawning(time);
      this.updateEnemies(time, timeStep);
      this.updateBullets(timeStep, time);
    }

    // Update camera shake
    this.updateShake(time);

    this.render(time);

    // Check if game just ended and return game over screen
    if (this.gameOver) {
      return new GameOverScreen(
        this.scene,
        this.players[0].score,
        this.players[1].score
      );
    }

    return null;
  }

  updateShake(time) {
    let shakeX = 0;
    let shakeY = 0;

    if (!this.gameOver) {
      const timeSinceHit = time - this.lastHitAt;
      if (timeSinceHit < HIT_SHAKE_TIME) {
        // Stronger shake during hit effect
        const hitShakeIntensity =
          SHAKE_INTENSITY * 8 * (1 - timeSinceHit / HIT_SHAKE_TIME);
        shakeX = (Math.random() - 0.5) * hitShakeIntensity;
        shakeY = (Math.random() - 0.5) * hitShakeIntensity;
      }
    }

    this.scene.cameras.main.setScroll(shakeX, shakeY);
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

    this.players.forEach((p) => p.render(this.graphics, time));
    this.enemies.forEach((e) => e.render(this.graphics, time));
    this.bullets.forEach((b) => b.render(this.graphics));
  }
}

const backupLocalStorage = new Map();
function getStorage() {
  try {
    localStorage.getItem("--close-corners-leaderboard");
    return localStorage;
  } catch {
    return {
      getItem: (key) => backupLocalStorage.get(key),
      setItem: (key, value) => backupLocalStorage.set(key, value),
    };
  }
}

function getLeaderboard() {
  const data = getStorage().getItem("--close-corners-leaderboard");
  if (!data) return [];
  try {
    const leaderboard = JSON.parse(data);
    return leaderboard.sort((a, b) => b.score - a.score).slice(0, 10);
  } catch {
    return [];
  }
}

function addScoreToLeaderboard(score, name, id) {
  const leaderboard = getLeaderboard();
  leaderboard.push({ id, score, name });

  leaderboard.sort((a, b) => {
    const diff = b.score - a.score;
    if (diff !== 0) return diff;
    return -a.id.localeCompare(b.id);
  });

  const top10 = leaderboard.slice(0, 10);
  getStorage().setItem("--close-corners-leaderboard", JSON.stringify(top10));
  return top10.findIndex((entry) => entry.id === id) !== -1;
}

function updateLeaderboardName(id, name) {
  const leaderboard = getLeaderboard();
  const entry = leaderboard.find((e) => e.id === id);
  if (entry) {
    entry.name = name;
    getStorage().setItem(
      "--close-corners-leaderboard",
      JSON.stringify(leaderboard)
    );
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

// ========== AUDIO SYSTEM ==========
class AudioSystem {
  constructor(scene) {
    this.scene = scene;
    this.musicLoop = null;
  }

  playTitleMusic() {
    this.stopAll();
    const notes = [196, 220, 247, 262];
    let index = 0;

    this.musicLoop = this.scene.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        const note = notes[index % notes.length];
        index++;
        this.playTone(note, 0.12, 180, "triangle");
      },
    });
  }

  playGameMusic() {
    this.stopAll();
    const highNote = 293.66;
    const lowNote = 220;
    const pattern = [
      { note: highNote, duration: 800, delay: 800 }, // 2 beats
      { note: highNote, duration: 100, delay: 200 }, // 1 beat
      { note: lowNote, duration: 200, delay: 400 }, // 1 beat
      { note: lowNote, duration: 200, delay: 400 }, // 1 beat
      { note: lowNote, duration: 200, delay: 300 }, // 1 beat
    ];
    let patternIndex = 0;

    const playNext = () => {
      const step = pattern[patternIndex];
      this.playTone(step.note, 0.1, step.duration, "sine");
      patternIndex = (patternIndex + 1) % pattern.length;
      this.musicLoop = this.scene.time.addEvent({
        delay: step.delay,
        callback: playNext,
      });
    };

    playNext();
  }

  playGameOverMusic() {
    this.stopAll();
    // Slower, more somber melody for game over
    const notes = [294, 262, 220, 196]; // D, C, A, G (descending)
    let noteIndex = 0;

    this.musicLoop = this.scene.time.addEvent({
      delay: 600,
      loop: true,
      callback: () => {
        this.playTone(notes[noteIndex % notes.length], 0.1, 200, "sine");
        noteIndex++;
      },
    });
  }

  playFlashSound() {
    // Powerful flash sound with frequency sweep
    this.playTone(800, 0.15, 100, "sawtooth");
    this.scene.time.delayedCall(50, () => {
      this.playTone(400, 0.12, 80, "square");
    });
  }

  playBulletSound() {
    // Short, sharp bullet fire sound
    this.playTone(150, 0.08, 50, "square");
  }

  playHitSound() {
    // Player taking damage - harsh downward sweep
    this.playTone(400, 0.2, 80, "sawtooth");
    this.scene.time.delayedCall(40, () => {
      this.playTone(200, 0.15, 60, "square");
    });
  }

  playHeartSound() {
    // Player gaining heart - upward sweep with pleasant tone
    this.playTone(300, 0.12, 60, "sine");
    this.scene.time.delayedCall(30, () => {
      this.playTone(450, 0.1, 70, "sine");
    });
    this.scene.time.delayedCall(60, () => {
      this.playTone(600, 0.08, 80, "triangle");
    });
  }

  playCaptureSound() {
    // Enemy captured - upward sweep with pleasant tone
    this.playTone(300, 0.12, 60, "sine");
    this.scene.time.delayedCall(30, () => {
      this.playTone(450, 0.1, 70, "sine");
    });
    this.scene.time.delayedCall(60, () => {
      this.playTone(600, 0.08, 80, "triangle");
    });
  }

  playTone(frequency, volume, duration, waveType = "sine") {
    const audioContext = this.scene.sound.context;
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = waveType;
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + duration / 1000
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);
  }

  stopAll() {
    if (this.musicLoop) {
      this.musicLoop.remove();
      this.musicLoop = null;
    }
  }
}

// ========== PHASER SCENE ==========
let currentScreen;
let keys;
let audioSystem;
let crtPipelineRegistered = false;

// Global variables to store last used names
let lastPlayer1Name = "   ";
let lastPlayer2Name = "   ";

function create() {
  audioSystem = new AudioSystem(this);

  currentScreen = new TitleScreen(this);
  // currentScreen = new GameOverScreen(this, 0, 0);

  keys = {
    player1: {
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      flash: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C),
      dash: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V),
    },
    player2: this.input.keyboard.createCursorKeys(),
    startKey: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
  };

  // Add dash and flash keys for player 2
  keys.player2.dash = this.input.keyboard.addKey(
    Phaser.Input.Keyboard.KeyCodes.K
  );
  keys.player2.flash = this.input.keyboard.addKey(
    Phaser.Input.Keyboard.KeyCodes.L
  );

  if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
    const pipelineManager = this.game.renderer.pipelines;
    if (!crtPipelineRegistered && pipelineManager?.addPostPipeline) {
      pipelineManager.addPostPipeline("crtPipeline", CRTPipeline);
      crtPipelineRegistered = true;
    }
    if (crtPipelineRegistered) {
      this.cameras.main.setPostPipeline("crtPipeline");
    }
  }
}

function update(time, delta) {
  const nextScreen = currentScreen.update(time, delta, keys);
  if (nextScreen) {
    currentScreen.destroy();
    currentScreen = nextScreen;
  }
}
