// main.js

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  /***** KONFIGURASI MAP DAN KOORDINAT *****/
  const TILE = 32;
  const MAP_W = 30;
  const MAP_H = 20;
  const MAP_PIX_W = 960;
  const MAP_PIX_H = 640;
  const START = { r: 15, c: 1, dir: 1 };

  function tileToX(c){ return c * TILE + TILE / 2; }
  function tileToY(r){ return r * TILE + TILE / 2; }

  /***** DEFINISI BLOK & GENERATOR (HARUS SEBELUM INJECT) *****/
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

  // Generator setup - try multiple approaches for compatibility
  if (typeof Blockly.JavaScript !== 'undefined') {
    // Newer Blockly versions
    if (Blockly.JavaScript.forBlock) {
      Blockly.JavaScript.forBlock['move_block'] = function(block, generator) {
        return 'move();\n';
      };
      Blockly.JavaScript.forBlock['turn_left'] = function(block, generator) {
        return 'turnLeft();\n';
      };
      Blockly.JavaScript.forBlock['turn_right'] = function(block, generator) {
        return 'turnRight();\n';
      };
      Blockly.JavaScript.forBlock['if_wall_ahead'] = function(block, generator) {
        return ['isWallAhead()', Blockly.JavaScript.ORDER_FUNCTION_CALL];
      };
    } else {
      // Older Blockly versions
      Blockly.JavaScript['move_block'] = function(block) {
        return 'move();\n';
      };
      Blockly.JavaScript['turn_left'] = function(block) {
        return 'turnLeft();\n';
      };
      Blockly.JavaScript['turn_right'] = function(block) {
        return 'turnRight();\n';
      };
      Blockly.JavaScript['if_wall_ahead'] = function(block) {
        return ['isWallAhead()', Blockly.JavaScript.ORDER_FUNCTION_CALL];
      };
    }
  }

  /***** TOOLBOX & INJECTION WORKSPACE *****/
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

  /***** PHASER GAME SETUP *****/
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
    // pastikan file ada di folder yang sama; ubah path jika perlu
    this.load.image('map', 'map_aksangfix.png');
    this.load.image('spawnfix', 'spawnfix.png');
    this.load.image('runright', 'runright.png');
    this.load.image('runup', 'runup.png');
  }

  function create(){
    gameScene = this;

    this.add.image(0, 0, 'map').setOrigin(0, 0).setDisplaySize(MAP_PIX_W, MAP_PIX_H);

    const g = this.add.graphics();
    g.lineStyle(1, 0x00ff00, 0.15);
    for (let i = 0; i <= MAP_W; i++) g.lineBetween(i*TILE, 0, i*TILE, MAP_H*TILE);
    for (let j = 0; j <= MAP_H; j++) g.lineBetween(0, j*TILE, MAP_W*TILE, j*TILE);

    const spawnX = tileToX(START.c) + 15; // keep offsets you used
    const spawnY = tileToY(START.r) + 8;
    ogSprite = this.add.image(spawnX, spawnY, 'spawnfix').setOrigin(0.5);
    ogSprite.setDisplaySize(TILE * 5, TILE * 5);

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
    if (!ogSprite) return;
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

  /***** LOGIC & HELPERS *****/
  function move(){ commandQueue.push({cmd:'MOVE'}); }
  function turnLeft(){ commandQueue.push({cmd:'TURN_LEFT'}); }
  function turnRight(){ commandQueue.push({cmd:'TURN_RIGHT'}); }

  function peekNextTile(r, c, dir, steps) {
    let dr = 0, dc = 0;
    if (dir === 0) dr = -1;        // UP
    else if (dir === 1) dc = 1;    // RIGHT
    else if (dir === 2) dr = 1;    // DOWN
    else if (dir === 3) dc = -1;   // LEFT
    return { r: r + dr * steps, c: c + dc * steps };
  }

  /***** WALLS: helper range + definisi dinding berdasarkan data kamu *****/
  // Helper: generate array tile dari rentang baris & kolom
  function wallRange(rStart, rEnd, cStart, cEnd) {
    const arr = [];
    for (let r = rStart; r <= rEnd; r++) {
      for (let c = cStart; c <= cEnd; c++) {
        arr.push({ r, c });
      }
    }
    return arr;
  }

  // NOTE: Kamu memberi "r=5-15, c=26-9" -> diasumsikan maksudnya c=9-26 (urut kecil->besar)
  const WALLS = [
    ...wallRange(16, 16, 0, 7),    // r=16, c=0-7
    ...wallRange(13, 13, 0, 4),    // r=13, c=0-4
    ...wallRange(5, 13, 5, 5),     // r=5-13, c=5
    ...wallRange(5, 5, 8, 8),      // r=5, c=8
    ...wallRange(5, 15, 9, 26),    // r=5-15, c=9-26  (diperbaiki dari "26-9")
    ...wallRange(6, 19, 26, 26),   // r=6-19, c=26
    ...wallRange(5, 5, 0, 4),      // r=5, c=0-4
    ...wallRange(2, 2, 0, 5),      // r=2, c=0-5
    ...wallRange(0, 1, 5, 5),      // r=0-1, c=5
    ...wallRange(2, 2, 8, 28),     // r=2, c=8-28
    ...wallRange(3, 15, 29, 29)    // r=3-15, c=29
  ];

  function isWallTile(r, c) {
    return WALLS.some(w => w.r === r && w.c === c);
  }

  // Update isWallAhead to include internal walls as well as boundaries
  function isWallAhead(){
    const next = peekNextTile(ogState.r, ogState.c, ogState.dir, 1);
    if (next.r < 0 || next.r >= MAP_H || next.c < 0 || next.c >= MAP_W) return true;
    return isWallTile(next.r, next.c);
  }

  function executeNextCommand(){
    if(commandQueue.length===0){ stopExecution(); return; }
    const item = commandQueue.shift();
    if(item.cmd==='MOVE'){ attemptMove(1); }
    else if(item.cmd==='TURN_LEFT'){ ogState.dir=(ogState.dir+3)%4; updateOGVisual(); }
    else if(item.cmd==='TURN_RIGHT'){ ogState.dir=(ogState.dir+1)%4; updateOGVisual(); }
  }

  /***** attemptMove dengan reset saat nabrak dinding (internal atau boundary) *****/
  function attemptMove(steps) {
    // Hitung arah berdasarkan dir
    const next = peekNextTile(ogState.r, ogState.c, ogState.dir, steps);

    // Cegah keluar dari batas peta
    if (next.r < 0 || next.r >= MAP_H || next.c < 0 || next.c >= MAP_W) {
      stopExecution();
      flashMessage('Keluar batas peta! Reset ke posisi awal.');
      resetOG();
      return;
    }

    // Cek dinding internal
    if (isWallTile(next.r, next.c)) {
      stopExecution();
      flashMessage(`Nabrak dinding di (r=${next.r}, c=${next.c})! Reset ke posisi awal.`);
      resetOG();
      return;
    }

    // Update posisi logika
    ogState.r = next.r;
    ogState.c = next.c;

    // Hitung posisi pixel sprite di Phaser
    const targetX = tileToX(ogState.c) + 16;
    const targetY = tileToY(ogState.r) + 8;

    // Animasi gerak
    gameScene.tweens.add({
      targets: ogSprite,
      x: targetX,
      y: targetY,
      duration: execInterval - 80,
      ease: 'Linear',
      onComplete: updateOGVisual
    });

    // Update highlight
    if (gameScene && gameScene.highlight) {
      gameScene.highlight.x = targetX;
      gameScene.highlight.y = targetY;
    }
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
      ogSprite.x = tileToX(ogState.c) + 16;
      ogSprite.y = tileToY(ogState.r) + 8;
      ogSprite.angle = 0;
      updateOGVisual();
    }
  }
  function flashMessage(msg){
    const info = document.getElementById('info');
    info.textContent = msg;
    setTimeout(()=>{ info.textContent='OG Maze — gunakan blok untuk menggerakkan OG melalui map.' },1800);
  }

  /***** BUTTON HANDLERS *****/
  document.getElementById('btnRun').onclick = ()=>{
    flushQueue();
    try{
      const code = Blockly.JavaScript.workspaceToCode(workspace);
      console.log('Generated code:', code); // Debug log
      const wrapped = new Function('move','turnLeft','turnRight','isWallAhead', code);
      wrapped(move,turnLeft,turnRight,isWallAhead);
      if(commandQueue.length===0){ flashMessage('Program menghasilkan 0 perintah.'); }
      else runQueue();
    }catch(e){ flashMessage('Error: '+e.message); console.error(e); }
  };
  document.getElementById('btnStop').onclick = ()=>{ stopExecution(); flashMessage('Execution stopped.'); };
  document.getElementById('btnReset').onclick = ()=>{ resetOG(); flashMessage('OG reset.'); };
  document.getElementById('btnClear').onclick = ()=>{ workspace.clear(); flushQueue(); };

  // expose workspace for debug in console if needed
  window._OG_workspace = workspace;
}
