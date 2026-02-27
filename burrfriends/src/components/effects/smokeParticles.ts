/**
 * Simple smoke particle system for canvas rendering
 */

export interface SmokeParticle {
  x: number;
  y: number;
  vx: number; // velocity x
  vy: number; // velocity y
  size: number;
  opacity: number;
  life: number; // 0 to 1
  maxLife: number; // milliseconds
  curlPhase: number; // for noise-based curl
}

export interface SmokeConfig {
  spawnRate: number; // particles per second
  maxParticles: number;
  baseVelocityY: number; // upward velocity base
  baseVelocityX: number; // horizontal drift
  baseSize: number;
  baseOpacity: number;
  windX: number; // external wind force (from scroll)
  windY: number;
}

const DEFAULT_CONFIG: SmokeConfig = {
  spawnRate: 8, // 8 particles per second (subtle)
  maxParticles: 100,
  baseVelocityY: -15, // px/s upward
  baseVelocityX: 0.5, // slight horizontal drift
  baseSize: 20,
  baseOpacity: 0.25,
  windX: 0,
  windY: 0,
};

export class SmokeSystem {
  private particles: SmokeParticle[] = [];
  private config: SmokeConfig;
  private spawnTimer: number = 0;
  private time: number = 0;

  constructor(config: Partial<SmokeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  update(deltaTime: number, spawnPoints: Array<{ x: number; y: number; weight: number }>) {
    this.time += deltaTime;
    this.spawnTimer += deltaTime;

    // Spawn new particles
    const spawnInterval = 1000 / this.config.spawnRate;
    while (this.spawnTimer >= spawnInterval && this.particles.length < this.config.maxParticles) {
      this.spawnParticle(spawnPoints);
      this.spawnTimer -= spawnInterval;
    }

    // Update existing particles
    this.particles = this.particles.filter((p) => {
      p.life += deltaTime;
      p.life = Math.min(p.life, p.maxLife);

      // Apply curl (noise-based horizontal drift)
      p.curlPhase += deltaTime * 0.001;
      const curlAmount = Math.sin(p.curlPhase) * 8; // -8 to 8px horizontal curl

      // Update velocity with wind and curl
      p.vx = this.config.baseVelocityX + this.config.windX * 0.5 + curlAmount * 0.3;
      p.vy = this.config.baseVelocityY + this.config.windY * 0.3;

      // Update position
      p.x += (p.vx * deltaTime) / 1000;
      p.y += (p.vy * deltaTime) / 1000;

      // Grow size over time (diffusion)
      p.size = this.config.baseSize * (1 + (p.life / p.maxLife) * 1.2);

      // Fade opacity
      const lifeProgress = p.life / p.maxLife;
      p.opacity = this.config.baseOpacity * (1 - lifeProgress * lifeProgress); // Quadratic fade

      // Keep particles that are still alive and visible
      return p.life < p.maxLife && p.opacity > 0.01;
    });
  }

  private   spawnParticle(spawnPoints: Array<{ x: number; y: number; weight: number }>) {
    if (spawnPoints.length === 0) return;

    // Weighted random selection (even distribution across spawn points)
    let totalWeight = 0;
    for (const pt of spawnPoints) {
      totalWeight += pt.weight;
    }
    let rand = Math.random() * totalWeight;
    let selectedPoint = spawnPoints[0];

    for (const pt of spawnPoints) {
      rand -= pt.weight;
      if (rand <= 0) {
        selectedPoint = pt;
        break;
      }
    }

    // More realistic smoke: smaller random offset, more natural velocity variation
    const particle: SmokeParticle = {
      x: selectedPoint.x + (Math.random() - 0.5) * 8, // Slightly smaller random offset for more even distribution
      y: selectedPoint.y,
      vx: this.config.baseVelocityX + (Math.random() - 0.5) * 1.5, // Reduced horizontal variation
      vy: this.config.baseVelocityY + (Math.random() - 0.5) * 4, // Slightly reduced vertical variation
      size: this.config.baseSize * (0.85 + Math.random() * 0.3), // More consistent size range
      opacity: this.config.baseOpacity * (0.75 + Math.random() * 0.25), // More consistent opacity
      life: 0,
      maxLife: 1800 + Math.random() * 1800, // 1.8s to 3.6s lifetime (more consistent)
      curlPhase: Math.random() * Math.PI * 2,
    };

    this.particles.push(particle);
  }

  spawnParticleAt(x: number, y: number, extraVelocity?: { vx?: number; vy?: number }) {
    const particle: SmokeParticle = {
      x,
      y,
      vx: (extraVelocity?.vx ?? 0) + this.config.baseVelocityX + (Math.random() - 0.5) * 2,
      vy: (extraVelocity?.vy ?? 0) + this.config.baseVelocityY + (Math.random() - 0.5) * 5,
      size: this.config.baseSize * (0.8 + Math.random() * 0.4),
      opacity: this.config.baseOpacity * (0.7 + Math.random() * 0.3),
      life: 0,
      maxLife: 1500 + Math.random() * 2000,
      curlPhase: Math.random() * Math.PI * 2,
    };

    this.particles.push(particle);
  }

  setWind(windX: number, windY: number) {
    this.config.windX = windX;
    this.config.windY = windY;
  }

  getParticles(): SmokeParticle[] {
    return this.particles;
  }

  reset() {
    this.particles = [];
    this.spawnTimer = 0;
  }

  getParticleCount(): number {
    return this.particles.length;
  }
}

