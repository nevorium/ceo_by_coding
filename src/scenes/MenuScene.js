import Phaser from 'phaser';
export class MenuScene extends Phaser.Scene {
  constructor(){super({key:'MenuScene'});}
  create(){this.scene.start('GameScene');}
}
