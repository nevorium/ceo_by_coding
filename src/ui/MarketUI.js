import { PLANT_TYPES } from '../data/plants.js';
import { REFINED_PRICES } from '../systems/EconomySystem.js';
import { pixelIcon } from '../rendering/PixelAssets.js';
export default class MarketUI {
  constructor(scene,economy,inventory){
    Object.assign(this,{scene,economy,inventory});this._visible=false;this._activeTab='buy';
    this.root=document.getElementById('market-content');this.tabs=document.getElementById('market-tabs');
    scene.panelManager.register('market-inspector',()=>{this._visible=false;});
    this.tabs.innerHTML=[['buy','Benih & kunci'],['sell','Jual hasil'],['modules','Modul'],['drones','Drone']].map(([id,title])=>'<button data-market-tab="'+id+'">'+title+'</button>').join('');
    this.onTab=e=>{const b=e.target.closest('[data-market-tab]');if(b){this._activeTab=b.dataset.marketTab;this.render();}};
    this.onClick=e=>{
      const b=e.target.closest('[data-market-action]');if(!b)return;
      let result;
      if(b.dataset.marketAction==='buy')result=b.dataset.item.startsWith('key_')?economy.buyKey(b.dataset.item):economy.buySeed(b.dataset.item);
      if(b.dataset.marketAction==='module')result=economy.buyModule(b.dataset.item);
      if(b.dataset.marketAction==='sell')result=economy.sellCrop(b.dataset.item,e.shiftKey?inventory.getItemCount(b.dataset.item):1);
      if(b.dataset.marketAction==='drone'){
        const count=scene.deviceManager.getAll().length,cost=economy.getDroneCost(count);
        if(count>=5)result={message:'Armada sudah mencapai batas.'};
        else if(inventory.removeCoins(cost)){scene.spawnNewDrone();result={message:'Drone baru siap.'};}
        else result={message:'Kas belum cukup.'};
      }
      if(result?.message)scene.hud.showMessage(result.message);
      this.render();scene.saveSystem.saveLocal();
    };
    this.tabs.addEventListener('click',this.onTab);this.root.addEventListener('click',this.onClick);
  }
  show(){this._visible=true;this.render();this.scene.panelManager.open('market-inspector');}
  hide(){this._visible=false;if(this.scene.panelManager.current==='market-inspector')this.scene.panelManager.close();}
  isVisible(){return this._visible;}
  _rebuildContent(){this.render();}
  render(){
    this.tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.marketTab===this._activeTab));
    let rows=[];
    if(this._activeTab==='buy')rows=this.economy.getShopItems().map(i=>({item:i.isKey?i.id:i.id+'_seed',name:i.name,cost:i.seedCost,action:'buy',id:i.id,locked:(i.unlockLevel||1)>this.scene.profileSystem.level}));
    if(this._activeTab==='sell')rows=this.inventory.getAllItems().filter(i=>PLANT_TYPES[i.id]||REFINED_PRICES[i.id]).map(i=>({item:i.id,id:i.id,name:(PLANT_TYPES[i.id]||REFINED_PRICES[i.id]).name+' × '+i.count,cost:this.economy.getSellPrice(i.id),action:'sell'}));
    if(this._activeTab==='modules')rows=this.economy.getShopModules().map(i=>({item:i.itemId,id:i.id,name:i.name,cost:i.cost,action:'module'}));
    if(this._activeTab==='drones'){const n=this.scene.deviceManager.getAll().length;rows=[{item:'drone',name:'Tambah drone ('+n+'/5)',cost:this.economy.getDroneCost(n),action:'drone',id:'drone',locked:n>=5}];}
    this.root.innerHTML='<p class="market-balance">Kas tersedia: '+this.inventory.getCoins()+'g</p>'+ (rows.length?rows.map(r=>'<article class="market-row">'+pixelIcon(r.item)+'<div><strong>'+r.name+'</strong><small>'+r.cost+'g'+(r.action==='sell'?' per unit':'')+'</small></div><button data-market-action="'+r.action+'" data-item="'+r.id+'" '+(r.locked||(r.action!=='sell'&&r.cost>this.inventory.getCoins())?'disabled':'')+'>'+(r.locked?'Terkunci':r.action==='sell'?'Jual 1':'Beli')+'</button></article>').join(''):'<p>Belum ada hasil untuk dijual.</p>')+(this._activeTab==='sell'?'<p>Shift + klik untuk menjual semua.</p>':'');
  }
  destroy(){this.hide();this.tabs.removeEventListener('click',this.onTab);this.root.removeEventListener('click',this.onClick);}
}
