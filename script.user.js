// ==UserScript==
// @name         VO Script
// @namespace    https://github.com/Kn0ax/VO-Turknet
// @version      2
// @description  Script for Place
// @author       Kn0ax, kanged from forsen community
// @match        https://www.reddit.com/r/place/*
// @match        https://new.reddit.com/r/place/*
// @icon         https://styles.redditmedia.com/t5_319cw/styles/communityIcon_78u97pp3tio41.png
// @require	     https://cdn.jsdelivr.net/npm/toastify-js
// @resource     TOASTIFY_CSS https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css
// @updateURL    https://github.com/Kn0ax/VO-Turknet/raw/utab/script.user.js
// @downloadURL  https://github.com/Kn0ax/VO-Turknet/utab/script.user.js
// @grant        GM_getResourceText
// @grant        GM_addStyle
// ==/UserScript==

const ORDERS_URL = 'https://gist.githubusercontent.com/Kn0ax/f53c4238f0ae20c93cfc7c36bc22016b/raw/ef48dcef3d721e50377aa78504ba78fdd4873591/orders.json'

const ORDER_UPDATE_DELAY = 4 * 60 * 1000
const TOAST_DURATION = 10000
const MAP_ERROR_RETRY_DELAY = 6000
const PARSE_ERROR_REFRESH_DELAY = 10000
const AFTER_PAINT_DELAY = 315000
const CHECK_AGAIN_DELAY = 30000

const COLOR_TO_INDEX = {
	'#BE0039': 1,
	'#FF4500': 2,
	'#FFA800': 3,
	'#FFD635': 4,
	'#00A368': 6,
	'#00CC78': 7,
	'#7EED56': 8,
	'#00756F': 9,
	'#009EAA': 10,
	'#2450A4': 12,
	'#3690EA': 13,
	'#51E9F4': 14,
	'#493AC1': 15,
	'#6A5CFF': 16,
	'#811E9F': 18,
	'#B44AC0': 19,
	'#FF3881': 22,
	'#FF99AA': 23,
	'#6D482F': 24,
	'#9C6926': 25,
	'#000000': 27,
	'#898D90': 29,
	'#D4D7D9': 30,
	'#FFFFFF': 31
};
const INDEX_TO_NAME = {
	'1': 'dark red',
	'2': 'red',
	'3': 'orange',
	'4': 'yellow',
	'6': 'dark green',
	'7': 'green',
	'8': 'light green',
	'9': 'dark teal',
	'10': 'teal',
	'12': 'dark blue',
	'13': 'blue',
	'14': 'light blue',
	'15': 'indigo',
	'16': 'periwinkle',
	'18': 'dark purple',
	'19': 'purple',
	'22': 'pink',
	'23': 'light pink',
	'24': 'dark brown',
	'25': 'brown', 
	'27': 'black',
	'29': 'gray',
	'30': 'light gray',
	'31': 'white'
};

var currentOrdersByPrio = [];
var accessToken;
var canvas = document.createElement('canvas');

(async function () {
	GM_addStyle(GM_getResourceText('TOASTIFY_CSS'));
	canvas.width = 2000;
	canvas.height = 1000;
	canvas.style.display = 'none';
	canvas = document.body.appendChild(canvas);

	Toastify({
		text: 'Obtaining access token...',
		duration: TOAST_DURATION
	}).showToast();
	accessToken = await getAccessToken();
	Toastify({
		text: 'Obtained access token!',
		duration: TOAST_DURATION
	}).showToast();

	setInterval(updateOrders, ORDER_UPDATE_DELAY);
	await updateOrders();
	executeOrders();
})();

async function getAccessToken() {
	const usingOldReddit = window.location.href.includes('new.reddit.com');
    const url = usingOldReddit ? 'https://new.reddit.com/r/place/' : 'https://www.reddit.com/r/place/';
    const response = await fetch(url);
    const responseText = await response.text();

	return responseText.split('\"accessToken\":\"')[1].split('"')[0];
}

function updateOrders() {
	fetch(ORDERS_URL).then(async (response) => {
		if (!response.ok) return console.warn('Couldn\'t get orders (error response code)');
		const newOrders = await response.json();

		if (JSON.stringify(newOrders) !== JSON.stringify(currentOrdersByPrio)) {
			currentOrdersByPrio = newOrders;
			Toastify({
				text: `Obtained new orders!`,
				duration: TOAST_DURATION
			}).showToast();
		}
	}).catch((e) => console.warn('Couldn\'t get orders', e));
}

async function executeOrders() {
	var ctx;
	try {
		ctx = await getCanvasFromUrl(await getCurrentImageUrl('0'), 0, 0);
		ctx = await getCanvasFromUrl(await getCurrentImageUrl('1'), 1000, 0);
	} catch (e) {
		console.warn('Error obtaining map', e);
		Toastify({
			text: `Couldn\'t get map. Trying again in ${MAP_ERROR_RETRY_DELAY / 1000} seconds...`,
			duration: MAP_ERROR_RETRY_DELAY
		}).showToast();
		setTimeout(executeOrders, MAP_ERROR_RETRY_DELAY);
		return;
	}

	for (const [prioIndex, orders] of currentOrdersByPrio.entries()) {
		let start = Math.floor(Math.random() * orders.length);
		for (let offset = 0; offset < orders.length; offset++) {
			const order = orders[(start + offset) % orders.length]
			const x = order[0];
			const y = order[1];
			const colorId = order[2];
			const rgbaAtLocation = ctx.getImageData(x, y, 1, 1).data;
			const hex = rgbToHex(rgbaAtLocation[0], rgbaAtLocation[1], rgbaAtLocation[2]);
			const currentColorId = COLOR_TO_INDEX[hex];
	
			// If the pixel color is already correct skip
			if (currentColorId == colorId) continue;
	
			Toastify({
				text: `Changing pixel on ${x}, ${y} with priority ${prioIndex + 1} from ${INDEX_TO_NAME[currentColorId]} to ${INDEX_TO_NAME[colorId]}`,
				duration: TOAST_DURATION
			}).showToast();
			const res = await place(x, y, colorId);
			const data = await res.json();
	
			try {
				if (data.errors) {
					const error = data.errors[0];
					const nextPixel = error.extensions.nextAvailablePixelTs + 3000;
					const nextPixelDate = new Date(nextPixel);
					const delay = nextPixelDate.getTime() - Date.now();
					Toastify({
						text : `Too early to place pixel! Next pixel at ${ nextPixelDate.toLocaleTimeString()}`,
						duration: delay
					}).showToast();
					setTimeout(executeOrders, delay);
				} else {
					const nextPixel = data.data.act.data[0].data.nextAvailablePixelTimestamp + 3000;
					const nextPixelDate = new Date(nextPixel);
					const delay = nextPixelDate.getTime() - Date.now();
					Toastify({
						text : `Pixel placed on ${x}, ${y}! Next pixel at ${nextPixelDate.toLocaleTimeString()}`,
						duration: delay
					}).showToast();
					setTimeout(executeOrders, delay);
				}
			} catch (e) {
				// The token probably expired, refresh and hope for the best
				console.warn ('Error parsing response', e);
				Toastify({
					text : `Error parsing response after placing pixel. Refreshing the page in ${PARSE_ERROR_REFRESH_DELAY / 1000} seconds...`,
					duration: PARSE_ERROR_REFRESH_DELAY
				}).showToast();
				setTimeout(() => {
					window.location.reload();
				}, PARSE_ERROR_REFRESH_DELAY);
			}
	
			return;
		}
	}

	Toastify({
		text: `Every pixel is correct! checking again in ${CHECK_AGAIN_DELAY / 1000} seconds...`,
		duration: CHECK_AGAIN_DELAY
	}).showToast();
	setTimeout(executeOrders, CHECK_AGAIN_DELAY);
}

function place(x, y, color) {
	return fetch('https://gql-realtime-2.reddit.com/query', {
		method: 'POST',
		body: JSON.stringify({
			'operationName': 'setPixel',
			'variables': {
				'input': {
					'actionName': 'r/replace:set_pixel',
					'PixelMessageData': {
						'coordinate': {
							'x': x,
							'y': y
						},
						'colorIndex': color,
						'canvasIndex': 0
					}
				}
			},
			'query': 'mutation setPixel($input: ActInput!) { act(input: $input) { data { ... on BasicMessage { id data { ... on GetUserCooldownResponseMessageData { nextAvailablePixelTimestamp __typename } ... on SetPixelResponseMessageData { timestamp __typename } __typename } __typename } __typename } __typename } }'
		}),
		headers: {
			'origin': 'https://hot-potato.reddit.com',
			'referer': 'https://hot-potato.reddit.com/',
			'apollographql-client-name': 'mona-lisa',
			'Authorization': `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		}
	});
}

async function getCurrentImageUrl(tag) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket('wss://gql-realtime-2.reddit.com/query', 'graphql-ws');

		ws.onopen = () => {
			ws.send(JSON.stringify({
				'type': 'connection_init',
				'payload': {
					'Authorization': `Bearer ${accessToken}`
				}
			}));
			ws.send(JSON.stringify({
				'id': '1',
				'type': 'start',
				'payload': {
					'variables': {
						'input': {
							'channel': {
								'teamOwner': 'AFD2022',
								'category': 'CANVAS',
								'tag': tag
							}
						}
					},
					'extensions': {},
					'operationName': 'replace',
					'query': 'subscription replace($input: SubscribeInput!) { subscribe(input: $input) { id ... on BasicMessage { data { __typename ... on FullFrameMessageData { __typename name timestamp } } __typename } __typename } }'
				}
			}));
		};

		ws.onmessage = (message) => {
			const { data } = message;
			const parsed = JSON.parse(data);

			if (!parsed.payload || !parsed.payload.data || !parsed.payload.data.subscribe || !parsed.payload.data.subscribe.data) return;

			ws.close();
			resolve(parsed.payload.data.subscribe.data.name + `?noCache=${Date.now() * Math.random()}`);
		}

		ws.onerror = reject;
	});
}

function getCanvasFromUrl(url, x, y) {
	return new Promise((resolve, reject) => {
		var ctx = canvas.getContext('2d');
		var img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			ctx.drawImage(img, x, y);
			resolve(ctx);
		};
		img.onerror = reject;
		img.src = url;
	});
}

function rgbToHex(r, g, b) {
	return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}
