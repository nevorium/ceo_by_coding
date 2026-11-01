const TILE_SIZE = 32;
const MIN_DOUBLE_SCALE_WIDTH = 640;

export function pixelViewport(width, height) {
  // The sidebar can reduce the available height without making the world
  // visually smaller. Keep desktop rendering at 2× based on its width;
  // the visible camera area becomes smaller instead of the sprites.
  const zoom = width >= MIN_DOUBLE_SCALE_WIDTH ? 2 : 1;
  // Round outward and let the clipped canvas cover the complete container.
  // This avoids dark gutters when a flexible drawer leaves a width/height
  // that is not an exact multiple of a pixel-art tile.
  const sourceSize = dimension => Math.max(
    TILE_SIZE,
    Math.ceil(dimension / zoom / TILE_SIZE) * TILE_SIZE,
  );
  const logicalWidth = sourceSize(width);
  const logicalHeight = sourceSize(height);
  const cssWidth = logicalWidth * zoom;
  const cssHeight = logicalHeight * zoom;
  const left = Math.floor((width - cssWidth) / 2);
  const top = Math.floor((height - cssHeight) / 2);
  const safe = {
    left: Math.ceil(Math.max(0, -left) / zoom),
    top: Math.ceil(Math.max(0, -top) / zoom),
    right: Math.ceil(Math.max(0, cssWidth + left - width) / zoom),
    bottom: Math.ceil(Math.max(0, cssHeight + top - height) / zoom),
  };

  return {
    width: logicalWidth,
    height: logicalHeight,
    zoom,
    cssWidth,
    cssHeight,
    left,
    top,
    safe,
  };
}
export function hotbarLayout(width,height,zoom,safeBottom=0) {
  const columns=width*zoom<384?4:8,size=44/zoom,gap=4/zoom,rows=8/columns;
  const left=Math.floor((width-columns*(size+gap)+gap)/2),top=height-safeBottom-rows*(size+gap)+gap-8/zoom;
  return {size,gap,columns,positions:Array.from({length:8},(_,i)=>({x:left+i%columns*(size+gap),y:top+Math.floor(i/columns)*(size+gap)}))};
}
export function installPixelViewport(game) {
  const parent=document.getElementById('game-container');let last='';
  const resize=()=>{
    const view=pixelViewport(parent.clientWidth,parent.clientHeight),signature=JSON.stringify(view);if(signature===last)return;last=signature;
    game.registry.set('pixelZoom',view.zoom);game.registry.set('pixelViewport',view);game.scale.resize(view.width,view.height);
    game.canvas.style.width=`${view.cssWidth}px`;game.canvas.style.height=`${view.cssHeight}px`;game.canvas.style.left=`${view.left}px`;game.canvas.style.top=`${view.top}px`;
    for(const[key,value]of Object.entries({left:view.left,top:view.top,width:view.cssWidth,height:view.cssHeight}))parent.style.setProperty(`--world-${key}`,`${value}px`);
    game.events.emit('pixel-resize',view);
  };
  const observer=new ResizeObserver(resize);observer.observe(parent);resize();game.events.once('destroy',()=>observer.disconnect());
}
