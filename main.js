/***** KONFIGURASI MAP DAN KOORDINAT *****/
const TILE = 32;
const MAP_W = 30;
const MAP_H = 20;
const MAP_PIX_W = 960;
const MAP_PIX_H = 640;
const START = { r: 5, c: 1, dir: 1 };

function tileToX(c){ return c * TILE + TILE / 2; }
function tileToY(r){ return r * TILE + TILE / 2; }

/***** BLOCKLY SETUP *****/
const toolbox = `
<xml xmlns="https://developers.google.com/blockly/xml" id="toolbox" style="display: none">
  <category name="Movement" colour="#4C97FF">
    <block type="move_block"></block>
    <block type="turn_left"></block>
    <block type="turn_right"></block>
  </category>
  <category name="Control" colour="#FFAB19">
    <block type="controls_repeat_ext">
      <value name="TIMES">
        <shadow type="math_number">
          <field name="NUM">3</field>
        </shadow>
      </value>
    </block>
    <block type="controls_if"></block>
  </category>
  <category name="Sensing" colour="#5CA65C">
    <block type="if_wall_ahead"></block>
  </category>
</xml>`;

const workspace = Blockly.inject('blocklyDiv', {
  toolbox: toolbox,
  scrollbars: true,
  zoom: { controls: true, wheel: true }
});

Blockly.defineBlocksWithJsonArray([
  { "type": "move_block", "message0": "move forward",
    "previousStatement": null, "nextStatement": null, "colour": 160 },
  { "type": "turn_left", "message0": "turn left",
    "previousStatement": null, "nextStatement": null, "colour": 230 },
  { "type": "turn_right", "message0": "turn right",
    "previousStatement": null, "nextStatement": null, "colour": 230 },
  { "type": "if_wall_ahead", "message0": "wall ahead?",
    "output": "Boolean", "colour": 65 }
]);

Blockly.JavaScript['move_block'] = () => 'move();\n';
Blockly.JavaScript['turn_left'] = () => 'turnLeft();\n';
Blockly.JavaScript['turn_right'] = () => 'turnRight();\n';
Blockly.JavaScript['if_wall_ahead'] = () => ['isWallAhead()', Blockly.JavaScript.ORDER_FUNCTION_CALL];

/***** PHASER GAME *****/
let ogState = { ...START };
let gameScene;
let commandQueue = [];
let executing = false;
let execInterval = 350;
let execTimer = null;
let ogSprite;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'gameArea',
  width: MAP_PIX_W,
  height: MAP_PIX_H,
  backgroundColor: '#000',
  scene: { preload, create },
  pixelArt: true
});

function preload(){
  this.load.image('map', 'map_aksangfix.png');
  this.load.image('spawnfix', 'spawnfix.png');
  this.load.image('runright', 'runright.png');
  this.load.image('runup', 'runup.png');
}

function create(){
  gameScene = this;

  const map = this.add.image(0, 0, 'map').setOrigin(0, 0)
    .setDisplaySize(MAP_PIX_W, MAP_PIX_H);

  const g = this.add.graphics();
  g.lineStyle(1, 0x00ff00, 0.15);
  for (let i = 0; i <= MAP_W; i++) g.lineBetween(i*TILE, 0, i*TILE, MAP_H*TILE);
  for (let j = 0; j <= MAP_H; j++) g.lineBetween(0, j*TILE, MAP_W*TILE, j*TILE);

  const spawnX = tileToX(START.c) + 16;
  const spawnY = tileToY(START.r) + 8;
  ogSprite = this.add.image(spawnX, spawnY, 'spawnfix').setOrigin(0.5);
  ogSprite.setDisplaySize(TILE * 3, TILE * 3);

  this.highlight = this.add.rectangle(spawnX, spawnY, TILE, TILE)
    .setStrokeStyle(1, 0xffffff, 0.4)
    .setFillStyle(0xffffff, 0.05);

  updateOGVisual();

  const info = document.getElementById('info');
  this.input.on('pointermove', (pointer) => {
    const x = Math.floor(pointer.x);
    const y = Math.floor(pointer.y);
    const tileC = Math.floor(x / TILE);
    const tileR = Math.floor(y / TILE);
    info.innerHTML = `Mouse: (${x}, ${y}) | Tile: (r=${tileR}, c=${tileC})`;
  });
  this.input.on('pointerout', () => {
    info.innerHTML = 'OG Maze — gunakan blok untuk menggerakkan OG melalui map.';
  });
}

function updateOGVisual(){
  if(ogState.dir === 1) ogSprite.setTexture('runright');
  else if(ogState.dir === 0) ogSprite.setTexture('runup');
  else ogSprite.setTexture('runright');

  if(ogState.dir === 3) ogSprite.angle = 180;
  else if(ogState.dir === 2) ogSprite.angle = 90;
  else ogSprite.angle = 0;

  if(gameScene && gameScene.highlight){
    gameScene.highlight.x = tileToX(ogState.c) + 16;
    gameScene.highlight.y = tileToY(ogState.r) + 8;
  }
}

/***** LOGIC & BUTTONS *****/
function move(){ commandQueue.push({cmd:'MOVE'}); }
function turnLeft(){ commandQueue.push({cmd:'TURN_LEFT'}); }
function turnRight(){ commandQueue.push({cmd:'TURN_RIGHT'}); }

function isWallAhead(){
  const next = peekNextTile(ogState.r, ogState.c, ogState.dir, 1);
  return next.r<0 || next.r>=MAP_H || next.c<0 || next.c>=MAP_W;
}
function peekNextTile(r,c,dir,steps){
  let dr=0,dc=0;
  if(dir===0) dr=-1; else if(dir===1) dc=1;
  else if(dir===2) dr=1; else if(dir===3) dc=-1;
  return {r:r+dr*steps, c:c+dc*steps};
}
function executeNextCommand(){
  if(commandQueue.length===0){ stopExecution(); return; }
  const item = commandQueue.shift();
  if(item.cmd==='MOVE'){ attemptMove(1); }
  else if(item.cmd==='TURN_LEFT'){ ogState.dir=(ogState.dir+3)%4; updateOGVisual(); }
  else if(item.cmd==='TURN_RIGHT'){ ogState.dir=(ogState.dir+1)%4; updateOGVisual(); }
}
function attemptMove(steps){
  const next = peekNextTile(ogState.r, ogState.c, ogState.dir, steps);
  if(next.r<0||next.r>=MAP_H||next.c<0||next.c>=MAP_W){
    stopExecution(); flashMessage('Blocked (boundary).'); return;
  }
  ogState.r = next.r; ogState.c = next.c;
  const targetX = tileToX(ogState.c), targetY = tileToY(ogState.r);
  gameScene.tweens.add({
    targets: ogSprite, x:targetX, y:targetY,
    duration: execInterval-80, ease:'Linear', onComplete: updateOGVisual
  });
  gameScene.highlight.x = targetX;
  gameScene.highlight.y = targetY;
}
function runQueue(){
  if(executing) return;
  executing = true;
  execTimer = setInterval(()=>{
    if(commandQueue.length===0){ stopExecution(); return; }
    executeNextCommand();
  }, execInterval);
}
function stopExecution(){
  executing=false;
  if(execTimer){ clearInterval(execTimer); execTimer=null; }
}
function flushQueue(){ commandQueue=[]; stopExecution(); }
function resetOG(){
  flushQueue();
  ogState = {...START};
  if(ogSprite){
    ogSprite.x = tileToX(ogState.c);
    ogSprite.y = tileToY(ogState.r);
    ogSprite.angle = 0;
    updateOGVisual();
  }
}
function flashMessage(msg){
  const info = document.getElementById('info');
  info.textContent = msg;
  setTimeout(()=>{ info.textContent='OG Maze — gunakan blok untuk menggerakkan OG melalui map.' },1800);
}
document.getElementById('btnRun').onclick = ()=>{
  flushQueue();
  try{
    const code = Blockly.JavaScript.workspaceToCode(workspace);
    const wrapped = new Function('move','turnLeft','turnRight','isWallAhead', code);
    wrapped(move,turnLeft,turnRight,isWallAhead);
    if(commandQueue.length===0){ flashMessage('Program menghasilkan 0 perintah.'); }
    else runQueue();
  }catch(e){ flashMessage('Error: '+e.message); console.error(e); }
};
document.getElementById('btnStop').onclick = ()=>{ stopExecution(); flashMessage('Execution stopped.'); };
document.getElementById('btnReset').onclick = ()=>{ resetOG(); flashMessage('OG reset.'); };
document.getElementById('btnClear').onclick = ()=>{ workspace.clear(); flushQueue(); };