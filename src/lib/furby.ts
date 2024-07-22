const fluff_service = 'dab91435-b5a1-e29c-b041-bcd562613bde';

var furby_uuids = {
    'GeneralPlusListen': 'dab91382-b5a1-e29c-b041-bcd562613bde',
    'GeneralPlusWrite':  'dab91383-b5a1-e29c-b041-bcd562613bde',
    'NordicListen':      'dab90756-b5a1-e29c-b041-bcd562613bde',
    'NordicWrite':       'dab90757-b5a1-e29c-b041-bcd562613bde',
    'RSSIListen':        'dab90755-b5a1-e29c-b041-bcd562613bde',
    'F2FListen':         'dab91440-b5a1-e29c-b041-bcd562613bde',
    'F2FWrite':          'dab91441-b5a1-e29c-b041-bcd562613bde',
    'FileWrite':         'dab90758-b5a1-e29c-b041-bcd562613bde'
}

var file_transfer_modes = {
    1: 'EndCurrentTransfer',
    2: 'ReadyToReceive',
    3: 'FileTransferTimeout',
    4: 'ReadyToAppend',
    5: 'FileReceivedOk',
    6: 'FileReceivedErr'
}

const SLOT_EMPTY = 0;
const SLOT_UPLOADING = 1;
const SLOT_FILLED = 2;
const SLOT_ACTIVE = 3;

function flipDict(d: Record<any,any>) {
    let flipped: Record<any,any> = {};
    for (let k in d) {
        let v = d[k];
        flipped[v] = k;
    }
    return flipped;
}

let uuid_lookup = flipDict(furby_uuids);
let file_transfer_lookup = flipDict(file_transfer_modes);
let device: any;
export let isConnected = false;
export let dlcdata: Record<string,any> = {};
let isTransferring = false;
let furby_chars: Record<string,any> = {};
let gp_listen_callbacks: any[] = [];
let nordicListener: any = null;
let keepAliveTimer: any = null;
let lastCommandSent = 0;
let NO_RESPONSE = Symbol();

function log(...args: any[]) {
    let bits = []
    for (let arg of args) {
        if (DataView.prototype.isPrototypeOf(arg))
            bits.push(buf2hex(arg))
        else
            bits.push(''+arg)
    }
    var s = bits.join(' ')
    console.log(s);
    /*let o = document.getElementById('out');
    o.textContent += s + "\n";
    o.scrollTop = o.scrollHeight;*/
}

function sleep(t: number) {
    return new Promise(resolve  => setTimeout(resolve, t));
}

function buf2hex(buffer: ArrayBuffer) {
    return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

function onConnected() {
    startKeepAlive();
    isConnected = true;
}

function onDisconnected(){
    log('Device disconnected');
    isConnected = false;
    if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
    }
    onDisconnected();
}

function handleGeneralPlusResponse(event: any) {
    let buf = event.target.value;
    if (buf.getUint8(0) != 0x22) // don't spam log with ImHereSignal keepalive responses TODO: decode this packet
        log('Got GeneralPlus response', buf);
    else {
        console.log(buf2hex(buf));
    }
    for (let handle in gp_listen_callbacks) {
        let [cb, prefix] = gp_listen_callbacks[handle];
        if (prefixMatches(prefix, buf))
            cb(buf);
    }
}

function handleNordicNotification(event: any) {
    //log('Nordic listen', buf);
    if (nordicListener) 
        nordicListener(event.target.value);
}

function prefixMatches(prefix: any, buf: DataView) {
    if (typeof(prefix) == 'undefined')
        return true;

    for (let i=0; i < prefix.length; i++) {
        if (buf.getUint8(i) != prefix[i])
            return false;
    }
    return true;
}

function addGPListenCallback(response_prefix: any, fn: (buf: DataView) => void) {
    let handle = gp_listen_callbacks.length;
    gp_listen_callbacks[handle] = [fn, response_prefix];
    return handle;
}

function removeGPListenCallback(handle: number) {
    delete gp_listen_callbacks[handle];
}

function onFurbySensorData(buf: DataView) {
    let state = decodeFurbyState(buf);
    console.log(state);
    let ul = document.getElementById('sensor-state');
    //ul.outerHTML = '<ul></ul>';
    /*while (ul.firstChild) {
        ul.removeChild(ul.firstChild);
    }

    for (k in state) {
        let v = state[k];
        let li = document.createElement('li');
        li.textContent = `${k}: ${v}`;
        ul.appendChild(li);
    }*/
}

async function getDLCInfo() {
    let buf = (await sendGPCmd([0x72], [0x72]))!;
    log('dlc info: ', buf);
    let filledSlots = (buf.getUint8(3) << 8) |  buf.getUint8(4);
    let activeSlots = (buf.getUint8(7) << 8) |  buf.getUint8(8);
    let slots = [];
    for (let i=0; i < 14; i++) {
        slots[i] = 0;
        if (filledSlots & (1 << i))
            slots[i] = SLOT_FILLED;
        if (activeSlots & (1 << i))
            slots[i] = SLOT_ACTIVE;
    }
    return slots;
}

async function getDLCSlotInfo(slot: number) {
    let buf = (await sendGPCmd([0x73, slot], [0x73, slot]))!;
    //log('Got slot info', buf);
    var props: Record<string,any> = {};
    props.len = buf.getUint32(9) & 0xffffff;
    if (props.len > 0) {
        let namebuf = new DataView(buf.buffer, 2, 8);
        let decoder = new TextDecoder('utf-8');
        props.name = decoder.decode(namebuf);
        props.checksum =  buf.getUint32(13);
        log(`slot ${slot} name: ${props.name}, length: ${props.len} chksum: 0x` + props.checksum.toString(16));
    } else {
        log(`slot ${slot} is empty`);
    }
    
    return props;
}

async function getActiveSlotInfo() {
    let allSlotsInfo = await getDLCInfo();
    let activeSlot = allSlotsInfo.indexOf(SLOT_ACTIVE);
    if (activeSlot == -1) return null;
    return await getDLCSlotInfo(activeSlot);
}

async function checkActiveSlot() {
    let activeSlot = await getActiveSlotInfo();
    if (activeSlot) {
        let filename = activeSlot.name.replace(/^_+/, '') + '.dlc'.toUpperCase();
        log('current active slot is ' + activeSlot.name + ' looking for ' + filename);
        for (let k in dlcdata) {
            if (k.toUpperCase() == filename) {
                log('setting up buttons for ' + k);
                //setupDLCButtons(dlcdata[k]);
            }
        }
    }
}

function decodeFurbyState(buf: DataView) {
    let antenna = '';
    if (buf.getUint8(1) & 2)
        antenna = 'left';
    if (buf.getUint8(1) & 1)
        antenna = 'right';
    if (buf.getUint8(2) == 0xc0) // fwd | back
        antenna = 'down';
    else if (buf.getUint8(2) & 0x40)
        antenna = 'forward';
    else if (buf.getUint8(2) & 0x80)
        antenna = 'back';

    let orientation = '';
    if (buf.getUint8(4) & 1) 
        orientation = 'upright';
    else if (buf.getUint8(4) & 2) 
        orientation = 'upside-down';   
    else if (buf.getUint8(4) & 4) 
        orientation = 'lying on right side';   
    else if (buf.getUint8(4) & 8) 
        orientation = 'lying on left side';      
    else if (buf.getUint8(4) & 0x20) 
        orientation = 'leaning back';
    else if (buf.getUint8(4) & 0x40) 
        orientation = 'tilted right'; 
    else if (buf.getUint8(4) & 0x80) 
        orientation = 'tilted left';    
    var state: Record<string,any> = {};
    state['antenna'] = antenna;
    state['orientation'] = orientation;

    if (buf.getUint8(2) & 1)
        state.tickle_head_back = true;
    if (buf.getUint8(2) & 2)
        state.tickle_tummy = true;
    if (buf.getUint8(2) & 4)
        state.tickle_right_side = true;
    if (buf.getUint8(2) & 8)
        state.tickle_left_side = true;
    if (buf.getUint8(2) & 0x10)
        state.pull_tail = true;
    if (buf.getUint8(2) & 0x20)
        state.push_tongue = true;
    return state;
}

function sendGPCmd(data: any, response_prefix: any): Promise<DataView|null> {
    return new Promise((resolve, reject) => {
        if (data.length != 2 && data[0] != 0x20 && data[1] != 0x06)
            log('Sending data to GeneralPlusWrite', buf2hex(data));
        var hnd: any;
        if (response_prefix != NO_RESPONSE) {
            hnd = addGPListenCallback(response_prefix, buf => {
                removeGPListenCallback(hnd);
                resolve(buf);
            });
        }
        lastCommandSent = performance.now();
        furby_chars.GeneralPlusWrite.writeValue(new Uint8Array(data))
            .then(() => {
                
                // if we're not expecting a response resolve once the data's been sent
                if (response_prefix == NO_RESPONSE) 
                    resolve(null);
            }).catch((error: any) => {
                if (response_prefix != NO_RESPONSE)
                    removeGPListenCallback(hnd);
                reject(error);
            });
    });
}

function deleteDLC(slot: any) {
    return sendGPCmd([0x74, slot], [0x74]);
}

function deactivateDLC(slot: any) {
    return sendGPCmd([0x62, slot], [0xdc]);
}

async function deleteAllDLCSlots() {
    for (let i=0; i<14; i++) {
        await deactivateDLC(i);
        await deleteDLC(i);
    }
}

async function getFirmwareVersion() {
    let buf = await sendGPCmd([0xfe], [0xfe]);
    let version = buf!.getUint8(1)
    log('Firmware version ', version);
    return version;
}

function setAntennaColor(r: number, g: number, b: number) {
    log(`Setting antenna color to (${r}, ${g}, ${b})`);
    return sendGPCmd([0x14, r, g, b], NO_RESPONSE);
}

function cycleDebug() {
    return sendGPCmd([0xdb], NO_RESPONSE);
}

function startKeepAlive() {
    keepAliveTimer = setInterval(async () => {
        if (isTransferring) return;
        if (performance.now() - lastCommandSent > 3000) {
            let buf = await sendGPCmd([0x20, 0x06], [0x22]);
            log('Got ImHereSignal', buf);
        }
    }, 1000);
}

export async function doConnect() {
    log('Requesting Bluetooth Devices with Furby name...');
    var server;
    try {
        device = await (navigator as any).bluetooth.requestDevice({
            filters: [{ name: 'Furby'}], 
            optionalServices: ['generic_access', 'device_information', fluff_service]});
        device.addEventListener('gattserverdisconnected', onDisconnected);
        log('Connecting to GATT Server...');
        server = await device.gatt.connect();
    } catch (e: any) {
        alert('Failed to connect');
        log(e.message);
        return;
    }

    try {
        log('Getting Furby Service...');
        const service = await server.getPrimaryService(fluff_service);
    
        log('Getting Furby Characteristics...');
        const characteristics = await service.getCharacteristics();
    
        // put handles to characteristics into chars object
        for (const characteristic of characteristics) {
            var uuid = characteristic.uuid;
            var name = uuid_lookup[uuid];
            var props = '';
            for (let k in characteristic.properties) {
                if (characteristic.properties[k]) props += k + ' ';
            }
            log('> Got Characteristic: ' + uuid + ' - ' + name + ' (' + props + ')');
            furby_chars[name] = characteristic;
        }
        // enable notifications
        furby_chars.GeneralPlusListen.addEventListener('characteristicvaluechanged', handleGeneralPlusResponse);
        await furby_chars.GeneralPlusListen.startNotifications();

        furby_chars.NordicListen.addEventListener('characteristicvaluechanged', handleNordicNotification);
        await furby_chars.NordicListen.startNotifications();
    } catch (e: any) {
        alert('Failed initialise BLE services');
        log(e.message);
        return;
    }
  
    //await triggerAction(39,4,2,0); // 'get ready'
    gp_listen_callbacks = [];
    startKeepAlive();
    onConnected();
    addGPListenCallback([0x21], onFurbySensorData);
    await checkActiveSlot();

    await setAntennaColor(255,0,0);
    await sleep(600);
    await setAntennaColor(0,255,0);
    await sleep(600);
    await setAntennaColor(0,0,255);
    await sleep(600);
}