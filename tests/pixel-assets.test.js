import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPixelAssets, PALETTE, PixelBitmap, ICON_IDS } from '../src/rendering/PixelAssets.js';
import { pixelViewport, hotbarLayout } from '../src/rendering/viewport.js';
const assets = buildPixelAssets();
const allowed = new Set(Object.values(PALETTE));

test('every source frame uses at most four palette colors and binary alpha', () => {
  for (const [key, asset] of assets) {
    for (const frame of asset.frames || [{ x:0,y:0,width:asset.width,height:asset.height }]) {
      const colors = new Set();
      for(let y=frame.y;y<frame.y+frame.height;y++) for(let x=frame.x;x<frame.x+frame.width;x++) {
        const i=(y*asset.width+x)*4, alpha=asset.data[i+3];
        assert.ok(alpha===0||alpha===255, `${key} antialiased alpha ${alpha}`);
        if(alpha){const hex='#'+[...asset.data.subarray(i,i+3)].map(n=>n.toString(16).padStart(2,'0')).join('');assert.ok(allowed.has(hex),`${key}: ${hex}`);colors.add(hex);}
      }
      assert.ok(colors.size<=4, `${key}/${frame.name}: ${colors.size} colors`);
    }
  }
});
test('player has 16 genuine 32px frames with distinct facing and walking art', () => {
  const player=assets.get('player');
  assert.equal(player.width,512);assert.equal(player.height,32);assert.equal(player.frames.length,16);
  const frameData=n=>{let bytes=[];for(let y=0;y<32;y++)bytes.push(...player.data.subarray((y*512+n*32)*4,(y*512+n*32+32)*4));return bytes;};
  assert.notDeepEqual(frameData(0),frameData(1));assert.notDeepEqual(frameData(0),frameData(4));assert.notDeepEqual(frameData(8),frameData(12));
  assert.deepEqual(player.frames.map(f=>f.name),Array.from({length:16},(_,i)=>i));
});
test('all shared item atlas frames match standalone icon textures', () => {
  const atlas=assets.get('item_atlas');assert.equal(atlas.frames.length,ICON_IDS.length);
  for(const [index,id] of ICON_IDS.entries()){
    const icon=assets.get('icon_'+id);assert.equal(icon.width,16);assert.equal(icon.height,16);
    for(let y=0;y<16;y++)assert.deepEqual(atlas.data.slice((y*atlas.width+index*16)*4,(y*atlas.width+index*16+16)*4),icon.data.slice(y*64,(y+1)*64));
  }
});
test('pixel primitives reject subpixel coordinates and unapproved colors',()=>{
  const b=new PixelBitmap(32,32);assert.throws(()=>b.pixel(.5,1,PALETTE.ink));assert.throws(()=>b.pixel(1,1,'#ffffff'));
});
test('responsive viewports retain desktop sprite scale when the code sidebar reduces game width',()=>{
  for(const width of [320,390,640,768,960,1024,1440]){
    const view=pixelViewport(width,900);
    assert.equal(view.width%32,0);assert.equal(view.height%32,0);assert.ok(view.cssWidth>=width);assert.ok(view.cssHeight>=900);
    assert.ok(view.cssWidth-width<64);assert.ok(view.cssHeight-900<64);
    assert.equal(view.cssWidth/view.width,width>=640?2:1);
    const layout=hotbarLayout(view.width,view.height,view.zoom);assert.ok(layout.size*view.zoom>=44);
    for(const p of layout.positions){assert.ok(p.x>=0&&p.y>=0);assert.ok(p.x+layout.size<=view.width);assert.ok(p.y+layout.size<=view.height);}
    assert.equal(layout.columns,width===320?4:8);
  }
  const sidebarOpen=pixelViewport(960,900);
  assert.equal(sidebarOpen.zoom,2);
  assert.equal(sidebarOpen.cssWidth,960);
  assert.equal(sidebarOpen.left,0);
});
test('short desktop game areas remain at 2× and cover the container',()=>{
  const view=pixelViewport(960,540);
  assert.equal(view.zoom,2);
  assert.ok(view.cssWidth>=960);assert.ok(view.cssHeight>=540);
});
test('hotbar stays above the clipped canvas edge in a short game area',()=>{
  const view=pixelViewport(960,600);
  const layout=hotbarLayout(view.width,view.height,view.zoom,view.safe.bottom);
  const lastSlot=layout.positions.at(-1);
  assert.ok(view.safe.bottom>0);
  assert.ok(lastSlot.y+layout.size<=view.height-view.safe.bottom);
  assert.ok(view.top+(lastSlot.y+layout.size)*view.zoom<=600);
});
