// All art is authored in source pixels: no canvas paths or resampling.
export const PALETTE = Object.freeze({ ink:'#101a21', panel:'#22343c', steel:'#42535b', silver:'#93a7a1', cream:'#edf0d4', sage:'#a4b18b', forest:'#244c3a', grass:'#4a7c59', earth:'#9b794e', sand:'#e3ba83', cyan:'#63d8d1', amber:'#e9bf62' });
const P = PALETTE;
const rgba = Object.fromEntries(Object.values(P).map(hex => [hex, [1,3,5].map(i => parseInt(hex.slice(i,i+2),16))]));
export class PixelBitmap {
  constructor(width,height) { this.width=width; this.height=height; this.data=new Uint8ClampedArray(width*height*4); }
  pixel(x,y,color) {
    if (!Number.isInteger(x)||!Number.isInteger(y)) throw new Error('Pixel coordinates must be integers');
    if (x<0||x>=this.width||y<0||y>=this.height) return;
    if (!rgba[color]) throw new Error(`Color outside palette: ${color}`);
    this.data.set([...rgba[color],255],(y*this.width+x)*4);
  }
  rect(x,y,w,h,color) { for(let j=y;j<y+h;j++) for(let i=x;i<x+w;i++) this.pixel(i,j,color); }
  box(x,y,w,h,fill,border=P.ink) { this.rect(x,y,w,h,border);this.rect(x+1,y+1,w-2,h-2,fill); }
  line(x1,y1,x2,y2,color) {
    const dx=Math.abs(x2-x1),dy=-Math.abs(y2-y1),sx=x1<x2?1:-1,sy=y1<y2?1:-1;let error=dx+dy;
    while(true) { this.pixel(x1,y1,color);if(x1===x2&&y1===y2)break;const e=2*error;if(e>=dy){error+=dy;x1+=sx;}if(e<=dx){error+=dx;y1+=sy;} }
  }
  blit(source,ox,oy,mirror=false) {
    for(let y=0;y<source.height;y++) for(let x=0;x<source.width;x++) {
      const si=(y*source.width+x)*4;if(!source.data[si+3])continue;
      const tx=ox+(mirror?source.width-x-1:x),ty=oy+y;
      if(tx>=0&&tx<this.width&&ty>=0&&ty<this.height)this.data.set(source.data.subarray(si,si+4),(ty*this.width+tx)*4);
    }
  }
}
function person(direction,step=0,role='player') {
  const b=new PixelBitmap(32,32),outfit=role==='eli'?P.steel:role==='buyer'?P.sage:P.forest;
  const accent=role==='eli'?P.cyan:P.amber,skin=P.sand,dark=P.ink,stride=[0,1,0,-1][step],side=direction>1,back=direction===1;
  b.rect(9,29,14,1,dark);b.box(11,23+stride,4,7-stride,outfit);b.box(17,23-stride,4,7+stride,outfit);
  b.rect(10,28+stride,5,2,dark);b.rect(17,28-stride,6,2,dark);b.box(10,13,12,12,outfit);
  b.box(8,14-stride,4,9,outfit);b.box(20,14+stride,4,9,outfit);b.rect(9,21-stride,2,2,skin);b.rect(21,21+stride,2,2,skin);
  b.rect(11,23,10,1,dark);b.rect(15,23,2,1,accent);
  if(back||side){b.box(side?9:12,14,side?6:8,8,accent);b.rect(side?11:14,16,side?2:4,1,dark);b.rect(side?11:15,18,1,3,outfit);}
  else{b.rect(12,15,2,5,accent);b.rect(18,15,2,5,accent);b.rect(14,18,4,5,outfit);b.rect(15,20,2,1,dark);}
  b.box(10,5,12,10,skin);
  if(back)b.rect(11,6,10,7,outfit);
  else{b.rect(11,6,10,2,dark);b.rect(side?19:13,9,1,2,dark);if(!side)b.rect(18,9,1,2,dark);b.rect(side?20:15,12,2,1,accent);}
  b.box(10,1,12,5,accent);b.rect(11,4,10,1,outfit);b.rect(7,5,18,2,dark);b.rect(8,5,16,1,accent);
  if(role==='eli'){b.rect(20,7,3,5,dark);b.rect(21,8,1,3,accent);}
  if(direction===2){const flipped=new PixelBitmap(32,32);flipped.blit(b,0,0,true);return flipped;}return b;
}
function machine(type,frame=0) {
  const b=new PixelBitmap(32,32),light=['bakery','boiler','fryer','smelter'].includes(type)?P.amber:P.cyan;
  b.rect(3,28,26,3,P.ink);b.box(4,11,24,18,P.steel);b.rect(5,12,22,1,P.silver);b.rect(5,26,22,2,P.ink);b.rect(6,24,2,1,P.silver);b.rect(24,24,2,1,P.silver);
  if(type==='mill'){
    b.box(10,2,12,8,P.steel);b.rect(12,3,8,2,P.silver);b.box(9,13,14,11,P.ink,P.silver);
    if(frame%2){b.line(11,15,21,22,light);b.line(21,15,11,22,light);}else{b.rect(15,14,2,9,light);b.rect(10,18,12,2,light);}b.box(12,26,8,4,P.silver);
  }else if(['bakery','smelter'].includes(type)){
    b.box(type==='smelter'?7:22,2,5,11,P.steel);b.rect(type==='smelter'?8:23,3,3,1,P.silver);b.box(8,15,16,10,P.ink,P.silver);
    b.rect(10,21-frame%2,12,2,light);b.rect(12,18+frame%2,3,4,light);b.rect(18,19,2,3,light);b.rect(10,11,11,2,P.silver);
  }else if(['boiler','purifier'].includes(type)){
    b.box(8,5,16,22,P.steel);b.rect(11,3,10,2,P.silver);b.rect(10,7,2,16,P.silver);b.box(15,10,5,13,P.ink,P.silver);
    b.rect(16,14+frame%2,3,7,light);b.rect(25,7,3,10,P.silver);b.rect(23,7,4,2,P.silver);
  }else if(type==='press'){
    b.box(5,4,22,5,P.steel);b.rect(7,5,18,1,P.silver);b.rect(7,9,2,15,P.silver);b.rect(23,9,2,15,P.silver);b.rect(15,9,2,6+frame%2,light);b.box(10,16+frame%2,12,4,P.silver);
  }else if(type==='fryer'){
    b.box(6,9,20,11,P.ink,P.silver);for(let x=9;x<=22;x+=4)b.rect(x,12+frame%2,2,5,light);b.rect(12,6,13,2,P.silver);b.rect(23,6,2,5,P.silver);
  }else{
    b.box(6,4,20,8,P.steel);b.rect(8,6,12,2,light);b.rect(8+frame%2,13,3,8,P.silver);b.rect(9+frame%2,19,11,2,P.silver);b.box(16,21,7,4,light);b.rect(23,5,2,5,P.silver);if(type==='module_crafter')b.rect(11,8,2,2,light);
  }return b;
}
function plant(type,stage) {
  const b=new PixelBitmap(32,32),stem=P.forest,leaf=P.grass,fruit=stage===3?P.amber:P.sage;
  if(stage===0){b.rect(13,23,6,2,P.earth);b.rect(15,21,2,2,fruit);return b;}
  if(type==='wheat'){
    for(let i=0;i<stage+1;i++){const x=9+i*4,top=22-stage*5+i%2*2;b.rect(x,top,1,26-top,stem);for(let y=top;y<top+8;y+=3){b.rect(x-2,y,2,2,fruit);b.rect(x+1,y+1,2,2,fruit);}b.line(x,21,x-3,18,leaf);}
  }else if(type==='apple_tree'){
    b.rect(14,15,4,13,P.earth);b.rect(13,26,7,2,P.earth);b.rect(9,12-stage*2,15,11+stage,stem);b.rect(6,13-stage,21,9,stem);b.rect(10,10-stage,11,11,leaf);
    if(stage===3){b.rect(9,13,3,3,fruit);b.rect(21,12,3,3,fruit);b.rect(16,19,3,3,fruit);}
  }else if(type==='cactus'){
    b.box(13,20-stage*4,7,7+stage*4,leaf,stem);b.rect(15,22-stage*4,1,stage*4,fruit);
    if(stage>1){b.rect(8,14,3,8,stem);b.rect(10,19,4,3,leaf);b.rect(19,17,5,3,leaf);b.rect(22,11,3,9,stem);}if(stage===3)b.rect(14,6,5,3,fruit);
  }else{b.rect(15,15,2,12,stem);b.rect(9,19,7,4,leaf);b.rect(17,15,7,5,leaf);b.rect(13,12,6,5,leaf);if(stage===3){b.rect(9,25,7,3,P.earth);b.rect(18,24,5,4,P.earth);}}
  return b;
}
function wildlife(type) {
  const b=new PixelBitmap(32,32);
  const fur=type==='deer'?P.sand:(type==='boar'?P.ink:P.silver);
  const accent=type==='deer'?P.earth:(type==='boar'?P.earth:P.sage);
  b.rect(7,23,18,4,P.ink);b.box(8,14,16,11,fur);b.rect(10,12,10,2,accent);
  b.box(type==='deer'||type==='boar'?20:5,9,7,8,fur);
  b.rect(type==='deer'||type==='boar'?23:7,10,1,2,P.ink);
  b.rect(12,24,3,4,P.ink);b.rect(20,24,3,4,P.ink);
  if(type==='deer'){
    b.rect(22,5,1,5,P.earth);b.rect(25,5,1,5,P.earth);
  } else if(type==='boar'){
    b.rect(25,13,3,4,P.earth);b.rect(25,15,2,2,P.cream);b.rect(10,10,8,3,P.earth);
  } else {
    b.rect(4,7,3,3,P.silver);b.rect(20,6,3,3,P.silver);
  }
  return b;
}
export const ICON_IDS=['crate','coin','seed','plow','watering_can','wheat_seed','potato_seed','apple_tree_seed','cactus_seed','wheat','potato','apple_tree','cactus','coal','copper_ore','iron_ore','gold_ore','copper_ingot','iron_ingot','gold_ingot','flour','bread','apple_juice','apple_jam','potato_starch','chips','wire','gear','chip','stone','wild_fiber','raw_meat','leather','bone','crafting_table_kit','warehouse_depot_kit','warehouse_kit','smelter_kit','mill_kit','assembler_kit','press_kit','boiler_kit','conveyor_kit','module_farming','module_supplier','module_seller','module_mining','module_bigger_seller','module_super_carrier','module_advanced_farming','module_speed_booster','key_zone2','key_zone3','key_zone4','drone','journal','menu','phone','pickaxe','teleporter_kit'];
function icon(id) {
  const b=new PixelBitmap(16,16);let base=P.silver,highlight=P.cream,detail=P.steel;
  if(/wheat|bread|chips|coin|gold|seed|key/.test(id)){base=P.amber;highlight=P.sand;detail=P.earth;}
  if(/apple|cactus|farming|fiber/.test(id)){base=P.grass;highlight=P.sage;detail=P.forest;}
  if(/juice|jam|watering|chip|phone|speed|teleporter/.test(id)){base=P.cyan;highlight=P.silver;detail=P.steel;}
  if(id==='coin'){b.rect(4,2,8,12,P.ink);b.rect(2,4,12,8,P.ink);b.rect(4,3,8,10,base);b.rect(3,5,10,6,base);b.rect(5,4,2,7,highlight);b.rect(9,5,2,6,detail);}
  else if(id==='plow'){b.line(3,13,11,5,detail);b.line(4,13,12,5,detail);b.box(3,2,10,4,base);b.rect(4,2,8,1,highlight);}
  else if(id==='pickaxe'){b.line(3,13,12,4,detail);b.line(4,13,13,4,detail);b.box(8,2,6,4,base);b.rect(9,2,4,1,highlight);b.rect(13,3,2,4,base);b.rect(7,5,4,2,base);}
  else if(id==='watering_can'){b.box(3,6,8,7,base);b.box(5,2,6,5,detail);b.rect(6,3,4,3,P.ink);b.line(10,9,14,5,highlight);b.rect(13,4,2,2,base);}
  else if(id==='teleporter_kit'){b.box(3,10,10,4,detail);b.box(4,2,8,9,base);b.rect(6,4,4,5,P.ink);b.rect(7,6,2,2,highlight);}
  else if(id==='wheat'||id==='wheat_seed'){b.rect(7,2,1,12,detail);for(let y=2;y<10;y+=3){b.rect(4,y,3,2,base);b.rect(8,y+1,3,2,highlight);}}
  else if(id.endsWith('_seed')||id==='seed'||/flour|starch/.test(id)){b.box(4,5,9,9,base);b.rect(5,2,7,3,detail);b.rect(7,7,2,5,highlight);}
  else if(/ore|coal|stone|potato|apple_tree|cactus/.test(id)){b.rect(4,3,8,10,P.ink);b.rect(2,5,12,6,P.ink);b.rect(4,4,8,8,base);b.rect(3,6,10,4,base);b.rect(5,5,3,2,highlight);b.rect(9,9,2,2,detail);}
  else if(/ingot|bread/.test(id)){b.box(2,6,12,7,base);b.rect(4,3,8,3,P.ink);b.rect(5,4,6,2,highlight);b.rect(3,7,10,2,highlight);}
  else if(/juice|jam/.test(id)){b.box(4,5,8,9,base);b.box(5,2,6,3,detail);b.rect(6,7,1,4,highlight);}
  else if(/gear|wire/.test(id)){b.box(3,3,10,10,base);b.box(6,6,4,4,P.ink,detail);b.rect(6,1,4,2,detail);b.rect(6,13,4,2,detail);b.rect(1,6,2,4,detail);b.rect(13,6,2,4,detail);b.rect(4,4,3,1,highlight);}
  else if(id.startsWith('key_')){b.box(3,2,7,7,base);b.rect(5,4,3,3,P.ink);b.rect(8,8,3,6,detail);b.rect(10,11,3,2,highlight);}
  else if(id==='raw_meat'){b.box(3,4,10,8,P.earth);b.rect(5,5,6,5,P.amber);b.rect(10,5,3,3,P.silver);}
  else if(id==='leather'){b.box(3,3,10,10,P.earth);b.rect(4,4,8,8,P.sand);b.rect(6,6,4,4,P.earth);}
  else if(id==='bone'){b.rect(4,6,8,4,P.cream);b.rect(2,4,4,4,P.silver);b.rect(10,8,4,4,P.silver);}
  else if(id==='drone'){b.box(4,4,8,8,base);b.rect(6,7,4,2,highlight);b.rect(1,3,5,2,detail);b.rect(10,3,5,2,detail);b.rect(6,12,4,2,detail);}
  else if(id==='journal'){b.box(3,2,10,12,base);b.rect(4,3,2,10,detail);b.rect(8,5,3,1,highlight);b.rect(8,8,3,1,highlight);}
  else if(id==='menu'){for(let y=3;y<=11;y+=4)b.box(2,y,12,3,base);}
  else{b.box(3,3,10,11,base);b.rect(4,4,8,2,highlight);b.box(6,7,4,4,detail);b.rect(4,12,8,1,detail);}return b;
}
function teleporterPad(frame = 0) {
  const b = new PixelBitmap(32, 32);
  const ring = frame ? P.cream : P.cyan, core = frame ? P.cyan : P.cream;
  b.rect(4, 24, 24, 5, P.ink);
  b.rect(3, 18, 26, 8, P.ink);
  b.rect(4, 19, 24, 6, P.panel);
  b.rect(9, 6, 14, 14, P.ink);
  b.rect(10, 7, 12, 12, ring);
  b.rect(12, 9, 8, 8, P.ink);
  b.rect(14, 11, 4, 4, core);
  return b;
}
export function buildPixelAssets() {
  const assets=new Map(),add=(key,bitmap,frames)=>assets.set(key,{...bitmap,frames});
  const sheet=(key,frames)=>{const b=new PixelBitmap(frames[0].width*frames.length,frames[0].height);frames.forEach((f,i)=>b.blit(f,i*f.width,0));add(key,b,frames.map((f,i)=>({name:i,x:i*f.width,y:0,width:f.width,height:f.height})));};
  sheet('player',Array.from({length:16},(_,i)=>person(Math.floor(i/4),i%4)));
  sheet('eli_npc',Array.from({length:4},(_,i)=>person(i,0,'eli')));sheet('buyer_npc',Array.from({length:4},(_,i)=>person(i,0,'buyer')));
  sheet('building_teleporter', [teleporterPad(0), teleporterPad(1)]);
  for(const type of ['grass','tilled','watered','fence','path']){
    const b=new PixelBitmap(32,32),base=type==='watered'?P.panel:type==='tilled'?P.earth:type==='path'?P.sand:P.grass;b.rect(0,0,32,32,base);
    if(['tilled','watered'].includes(type))for(let y=3;y<32;y+=6){b.rect(2,y,28,1,type==='watered'?P.ink:P.forest);b.rect(4+y%3*4,y+1,3,1,type==='watered'?P.steel:P.sand);}
    else if(type==='fence'){b.rect(3,6,4,24,P.forest);b.rect(25,6,4,24,P.forest);b.rect(0,12,32,3,P.earth);b.rect(0,22,32,3,P.earth);b.rect(4,5,2,22,P.sand);b.rect(26,5,2,22,P.sand);}
    else for(let i=0;i<9;i++){const x=(i*13+5)%30,y=(i*7+3)%30;b.rect(x,y,1,2,type==='path'?P.earth:P.forest);if(type==='grass'&&i%3===0)b.rect(x+1,y+1,1,1,P.sage);}
    add(`tile_${type}`,b);
  }
  for(const type of ['wheat','potato','apple_tree','cactus'])for(let stage=0;stage<4;stage++)add(`plant_${type}_${stage}`,plant(type,stage));
  for(const type of ['mill','bakery','press','boiler','purifier','fryer','smelter','assembler','module_crafter','crafting_table']){add(`machine_${type}`,machine(type));add(`machine_${type}_work`,machine(type,1));}
  for(const [type,fleck]of Object.entries({stone:P.sage,coal:P.ink,copper:P.earth,iron:P.silver,gold:P.amber})){
    const b=new PixelBitmap(32,32);b.rect(0,0,32,32,P.panel);b.rect(4,9,24,18,P.steel);b.rect(9,4,14,24,P.steel);b.rect(9,5,10,2,P.silver);b.rect(6,10,3,8,P.silver);b.rect(12,10,5,4,fleck);b.rect(21,18,4,5,fleck);b.rect(10,21,4,3,fleck);add(`tile_ore_${type}`,b);
  }
  for(const type of ['debris','iron','laser']){
    const b=new PixelBitmap(32,32);b.rect(0,0,32,32,P.panel);const accent=type==='debris'?P.earth:type==='laser'?P.cyan:P.silver;
    for(let x=4;x<32;x+=8)b.rect(x,2,3,28,accent);b.rect(1,8,30,3,P.steel);b.rect(1,22,30,3,P.steel);b.box(12,12,8,9,P.amber,P.steel);add(`tile_gate_${type}`,b);
  }
  const drone=new PixelBitmap(32,32);drone.box(8,9,16,13,P.silver);drone.box(11,6,10,4,P.steel);drone.rect(3,7,8,2,P.steel);drone.rect(21,7,8,2,P.steel);drone.rect(6,9,2,7,P.ink);drone.rect(24,9,2,7,P.ink);drone.rect(12,13,3,3,P.cyan);drone.rect(18,13,3,3,P.cyan);drone.rect(13,21,6,4,P.steel);add('drone',drone);
  add('wildlife_deer',wildlife('deer'));add('wildlife_hare',wildlife('hare'));add('wildlife_boar',wildlife('boar'));
  for(const [key,w,h,sign]of [['market',96,64,P.amber],['warehouse',64,64,P.cyan]]){
    const b=new PixelBitmap(w,h);b.box(4,20,w-8,h-22,P.steel);b.rect(5,21,w-10,3,P.silver);
    for(let row=0;row<5;row++)b.rect(4+row*2,18-row*3,w-8-row*4,3,P.ink);
    b.box(w/2-11,35,22,h-37,P.ink,P.silver);b.rect(12,32,12,12,P.ink);b.rect(13,33,4,10,sign);b.rect(19,33,4,10,sign);
    b.rect(w-24,32,12,12,P.ink);b.rect(w-23,33,4,10,sign);b.rect(w-17,33,4,10,sign);b.box(w/2-13,21,26,7,sign);add(key,b);
  }
  for(const dir of ['up','down','left','right']){
    const b=new PixelBitmap(32,32);b.rect(0,0,32,32,P.ink);b.rect(2,2,28,28,P.panel);
    for(let i=4;i<31;i+=6)if(['up','down'].includes(dir))b.rect(2,i,28,2,P.steel);else b.rect(i,2,2,28,P.steel);
    for(let i=0;i<6;i++)if(['up','down'].includes(dir))b.rect(10+i,dir==='up'?15-i:10+i,12-i*2,1,P.amber);else b.rect(dir==='left'?15-i:10+i,10+i,1,12-i*2,P.amber);add(`tile_conveyor_${dir}`,b);
  }
  const cursor=new PixelBitmap(32,32);for(const x of [0,25])for(const y of [0,25]){cursor.rect(x,y===0?0:31,7,1,P.cyan);cursor.rect(x===0?0:31,y,1,7,P.cyan);}add('cursor',cursor);
  for(const [key,color]of [['particle',P.sand],['particle_water',P.cyan]]){const b=new PixelBitmap(4,4);b.rect(1,0,2,4,color);b.rect(0,1,4,2,color);add(key,b);}
  const atlas=new PixelBitmap(ICON_IDS.length*16,16);ICON_IDS.forEach((id,i)=>{const b=icon(id);add(`icon_${id}`,b);atlas.blit(b,i*16,0);});add('item_atlas',atlas,ICON_IDS.map((id,i)=>({name:id,x:i*16,y:0,width:16,height:16})));
  return assets;
}
export function pixelIcon(id,extraClass='') { const index=Math.max(0,ICON_IDS.indexOf(id));return `<span class="pixel-icon ${extraClass}" style="--icon-index:${index}" aria-hidden="true"></span>`; }

