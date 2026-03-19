/**
 * HLS media stream data for the streamshop site.
 */

export interface StreamChannel {
	name: string;
	title: string;
	viewerCount: number;
	isLive: boolean;
	startedAt: string;
	category: string;
}

export const CHANNELS: StreamChannel[] = [
	{ name: 'boardshop-live', title: 'New deck unboxing + giveaway!', viewerCount: 1247, isLive: true, startedAt: '2026-03-19T10:00:00Z', category: 'Skateboarding' },
	{ name: 'pro-skater', title: 'Street session downtown', viewerCount: 523, isLive: true, startedAt: '2026-03-19T14:00:00Z', category: 'Skateboarding' },
	{ name: 'wheel-reviews', title: 'Spitfire vs Bones comparison', viewerCount: 89, isLive: false, startedAt: '', category: 'Reviews' },
];

export const QUALITY_VARIANTS = [
	{ name: '1080p60', resolution: '1920x1080', bandwidth: 6000000, fps: 60, codecs: 'avc1.64002A,mp4a.40.2' },
	{ name: '720p60', resolution: '1280x720', bandwidth: 3000000, fps: 60, codecs: 'avc1.4D401F,mp4a.40.2' },
	{ name: '720p30', resolution: '1280x720', bandwidth: 2000000, fps: 30, codecs: 'avc1.4D401F,mp4a.40.2' },
	{ name: '360p30', resolution: '640x360', bandwidth: 600000, fps: 30, codecs: 'avc1.4D401F,mp4a.40.2' },
	{ name: 'audio_only', resolution: '', bandwidth: 160000, fps: 0, codecs: 'mp4a.40.2' },
];

/** Generate HLS master playlist */
export function generateMasterPlaylist(_baseUrl?: string): string {
	const lines = ['#EXTM3U'];
	for (const v of QUALITY_VARIANTS) {
		if (v.name === 'audio_only') {
			lines.push(`#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="${v.name}",NAME="${v.name}",AUTOSELECT=NO,DEFAULT=NO`);
			lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},CODECS="${v.codecs}",VIDEO="${v.name}"`);
		} else {
			lines.push(`#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="${v.name}",NAME="${v.name}",AUTOSELECT=YES,DEFAULT=${v.name === '720p60' ? 'YES' : 'NO'}`);
			lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},RESOLUTION=${v.resolution},CODECS="${v.codecs}",VIDEO="${v.name}",FRAME-RATE=${v.fps}.000`);
		}
		lines.push(`stream/${v.name}.m3u8`);
	}
	return lines.join('\n');
}

/** Generate HLS variant playlist (segment list) */
export function generateVariantPlaylist(_baseUrl: string, quality: string): string {
	const lines = [
		'#EXTM3U',
		'#EXT-X-VERSION:3',
		'#EXT-X-TARGETDURATION:4',
		`#EXT-X-MEDIA-SEQUENCE:${Math.floor(Date.now() / 4000)}`,
	];
	// 5 segments
	for (let i = 0; i < 5; i++) {
		lines.push('#EXTINF:4.000,');
		lines.push(`segments/${quality}_${Date.now() + i * 4000}.ts`);
	}
	return lines.join('\n');
}

/** Chat messages for IRC-like WebSocket */
export const CHAT_MESSAGES = [
	{ user: 'sk8er_mike', message: 'that deck looks sick!' },
	{ user: 'pro_jane', message: 'what size is that? 8.25?' },
	{ user: 'deck_lord', message: 'Element all day' },
	{ user: 'grind_master', message: 'can you do a kickflip on it?' },
	{ user: 'wheel_wizard', message: 'those wheels are 🔥' },
	{ user: 'flip_queen', message: 'I just ordered the same one' },
	{ user: 'park_rat', message: 'how much was it?' },
	{ user: 'rail_rider', message: 'Baker > Element, fight me' },
	{ user: 'sk8er_mike', message: 'lol no way, Element is goated' },
	{ user: 'pro_jane', message: 'Independent trucks or nothing' },
];
