import Phaser from 'phaser';
import { buildPixelAssets } from '../rendering/PixelAssets.js';

export class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }
  create() {
    for (const [key, bitmap] of buildPixelAssets()) {
      const texture = this.textures.createCanvas(key, bitmap.width, bitmap.height);
      const ctx = texture.getContext();
      ctx.imageSmoothingEnabled = false;
      const image = ctx.createImageData(bitmap.width, bitmap.height);
      image.data.set(bitmap.data);
      ctx.putImageData(image, 0, 0);
      for (const frame of bitmap.frames || []) texture.add(frame.name, 0, frame.x, frame.y, frame.width, frame.height);
      texture.refresh();
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      if (key === 'item_atlas') {
        document.documentElement.style.setProperty('--item-atlas', `url("${texture.getSourceImage().toDataURL()}")`);
        document.documentElement.style.setProperty('--atlas-width', `${bitmap.width * 2}px`);
      }
    }
    document.getElementById('loading-screen').style.display = 'none';
    this.scene.start('MenuScene');
  }
}
