export default class HUD {
  constructor(scene, inventory) { this.scene = scene; this.inventory = inventory; this._currentAction = ''; this.toast = document.getElementById('game-toast'); }
  update() {
    const coins = `${this.inventory.getCoins().toLocaleString('id-ID')}g`;
    const wallet = document.getElementById('workspace-wallet');
    if (wallet.textContent !== coins) wallet.textContent = coins;
    const drones = this.scene.deviceManager.getAll();
    const status = `${drones.filter(d => d.status === 'running').length}/${drones.length} drone aktif`;
    const fleet = document.getElementById('workspace-fleet');
    if (fleet.textContent !== status) fleet.textContent = status;
  }
  showMessage(text, duration = 2000) {
    clearTimeout(this.timeout);
    this.toast.textContent = text.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim();
    this.toast.classList.add('visible');
    this.timeout = setTimeout(() => this.toast.classList.remove('visible'), duration);
  }
  setCurrentAction(actionName) { this._currentAction = actionName; }
  destroy() { clearTimeout(this.timeout); this.toast.classList.remove('visible'); }
}
