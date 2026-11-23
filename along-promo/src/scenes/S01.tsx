// S01 市场与数据（126–405，夜）——亚太居中的点阵世界地图（Natural Earth 110m），七座城市的飞线打进上海
// （glow-flyline-moves · flyline-arc：22f out-cubic 生长、亮头暗尾、到达帧冲击环），数据卡随旁白逐张落定，
// 末尾急推上海节点（crash-zoom-punch：预备回拉 → 6f 强 ease-in 急推 → 一次阻尼回弹），节点成为下一镜的入境章。
import React from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import { useShotFrame } from '../lib/shot';
import { cue, shot } from '../timeline';
import { FONT } from '../tokens';
import { CHINA, CITY, LAND, MAP } from './S01/dotmap';
import { Big, Card, Label, Leader, Roll } from './S01/cards';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const SH = CITY.shanghai;
const ARCS: [string, number][] = [['london', 26], ['newyork', 33], ['paris', 39], ['losangeles', 45], ['frankfurt', 50], ['tokyo', 54], ['seoul', 57]];
const GOLD = '#F1D29A';
const FROM = shot('S01').from;
const T57 = cue('N1', '五十七') - FROM - 4, TQ3 = cue('N1', '三季度') - FROM - 6, TROLL = cue('N1', '同比') - FROM - 4;
export const S01_BEATS = { arcs: 26, arrive: 48, card57: T57, cardQ3: TQ3, roll: TROLL, cardEU: 70, cardTop: 92, pull: 244, push: 254, hit: 260 };

// Camera: zoom z and the screen position (ax, ay) of the Shanghai node.
function camera(f: number) {
  const o = interpolate(f, [-20, 40], [0, 1], { ...clamp, easing: Easing.bezier(0.33, 0, 0.2, 1) });
  let z = Math.exp(Math.log(1.32) * (1 - o)) * (1 + 0.012 * interpolate(f, [40, 244], [0, 1], clamp));
  let ax = SH[0] + (930 - SH[0]) * (1 - o), ay = SH[1] + (470 - SH[1]) * (1 - o);
  const prep = interpolate(f, [244, 254], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  z *= 1 - 0.04 * prep;
  const p = interpolate(f, [254, 260], [0, 1], { ...clamp, easing: Easing.bezier(0.55, 0, 0.9, 0.3) });
  if (p > 0) {
    z = Math.exp(Math.log(z) + (Math.log(9.4) - Math.log(z)) * p);
    ax += (960 - ax) * p; ay += (540 - ay) * p;
  }
  if (f > 260) { const t = f - 260; z = 8.9 + 0.5 * Math.exp(-t / 3) * Math.cos(t / 2.2); ax = 960; ay = 540; }
  return { z, ax, ay };
}

export const S01: React.FC = () => {
  const f = useShotFrame();
  const t57 = T57, tQ3 = TQ3, tRoll = TROLL;
  const { z, ax, ay } = camera(f);
  const tx = ax - SH[0] * z, ty = ay - SH[1] * z;
  const fade = interpolate(f, [244, 256], [1, 0], clamp); // cards and labels leave before the push
  const arcFade = interpolate(f, [258, 270], [1, 0.25], clamp);
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(130% 110% at 45% 35%, #243041 0%, #1A2230 45%, #0F141C 100%)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <g stroke="rgba(255,255,255,.05)" strokeWidth={1 / z}>
            {[-60, -30, 0, 30, 60].map((la) => <line key={la} x1={-400} x2={2320} y1={MAP.cy - la * MAP.scale} y2={MAP.cy - la * MAP.scale} />)}
          </g>
          <path d={LAND} fill="rgba(226,215,196,.34)" />
          <path d={CHINA} fill="rgba(214,120,88,.85)" />
          {ARCS.map(([city, start]) => <Arc key={city} f={f} from={CITY[city]} start={start} z={z} fade={arcFade} />)}
          <Leader f={f} at={t57} x1={680} y1={400} x2={SH[0] - 8} y2={SH[1] + 8} out={fade} />
          <Leader f={f} at={tQ3} x1={1010} y1={430} x2={SH[0] + 12} y2={SH[1] + 10} out={fade} />
          <Leader f={f} at={70} x1={270} y1={580} x2={CITY.paris[0]} y2={CITY.paris[1]} out={fade} />
          <Leader f={f} at={92} x1={1380} y1={300} x2={CITY.losangeles[0]} y2={CITY.losangeles[1]} out={fade} />
          {/* Shanghai: the red node that becomes the entry stamp */}
          <circle cx={SH[0]} cy={SH[1]} r={30} fill="rgba(178,74,44,.25)" opacity={fade * interpolate(f, [48, 62], [0, 1], clamp)} />
          <circle cx={SH[0]} cy={SH[1]} r={9} fill="#B24A2C" />
          <circle cx={SH[0]} cy={SH[1]} r={6.6} fill="none" stroke="#F7F2E8" strokeWidth={0.8} />
          <text x={SH[0]} y={SH[1] + 1.1} textAnchor="middle" dominantBaseline="middle" fontFamily="'Along Serif'" fontSize={3.4} fill="#F7F2E8">上海</text>
        </svg>
        <div style={{ opacity: fade }}>
          <CityLabel x={SH[0] - 24} y={SH[1] - 26} zh="上海" en="Shanghai" f={f} at={48} hi right />
          <CityLabel x={250} y={150} zh="欧洲" en="Europe" f={f} at={30} />
          <CityLabel x={CITY.newyork[0] - 40} y={CITY.newyork[1] - 60} zh="纽约" en="New York" f={f} at={36} />
          <CityLabel x={CITY.losangeles[0] - 70} y={CITY.losangeles[1] + 16} zh="洛杉矶" en="Los Angeles" f={f} at={48} />
          <CityLabel x={1010} y={226} zh="首尔 · 东京" en="Seoul · Tokyo" f={f} at={56} />
        </div>
        <Card f={f} at={t57} x={300} y={330} w={380} out={fade}>
          <Label zh="240 小时过境免签" en="240-hour visa-free transit" />
          <Big>57<span style={{ fontSize: 40, fontFamily: FONT.sans }}>国</span></Big>
        </Card>
        <Card f={f} at={tQ3} x={1010} y={368} w={430} out={fade}>
          <Label zh="2026 Q3 免签入境外国人" en="Visa-free entries, Q3 2026" />
          <Big>899.2<span style={{ fontSize: 40, fontFamily: FONT.sans }}>万人次</span></Big>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 6 }}>
            <span style={{ opacity: interpolate(f, [tRoll - 2, tRoll + 4], [0, 1], clamp) }}><Roll value="+24.1%" f={f} start={tRoll} size={64} color="#F08C6E" /></span>
            <span style={{ fontFamily: FONT.sans, fontSize: 32, opacity: interpolate(f, [tRoll + 18, tRoll + 28], [0, 0.85], clamp) }}>同比 YoY</span>
          </div>
          <div style={{ fontFamily: FONT.sans, fontSize: 32, marginTop: 4, color: 'rgba(243,237,226,.8)', opacity: interpolate(f, [tRoll + 26, tRoll + 36], [0, 1], clamp) }}>占入境外国人 77.5%</div>
        </Card>
        <Card f={f} at={tQ3 + 24} x={560} y={580} w={430} out={fade}>
          <Label zh="2026 上半年外国人入境" en="Foreign entries, H1 2026" />
          <Big size={60}>2291<span style={{ fontSize: 36, fontFamily: FONT.sans }}>万</span><span style={{ fontSize: 44, color: '#F08C6E' }}>+20.4%</span></Big>
        </Card>
        <Card f={f} at={70} x={70} y={580} w={400} out={fade}>
          <Label zh="欧洲游客暑期订单" en="Summer bookings from Europe" />
          <Big size={64}>+275%</Big>
        </Card>
        <Card f={f} at={92} x={1180} y={196} w={430} out={fade}>
          <Label zh="韩国 · 美国 · 日本" en="Korea · US · Japan" />
          <div style={{ fontFamily: FONT.sans, fontSize: 32, marginTop: 8, color: GOLD }}>位列入境前十客源国 · Q3</div>
        </Card>
        <Card f={f} at={tQ3 + 40} x={1480} y={430} w={400} out={fade}>
          <Label zh="#Chinamaxxing 话题浏览" en="views on overseas social media" />
          <Big size={64}>40 亿+</Big>
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 804, textAlign: 'center', fontFamily: FONT.sans, fontSize: 32,
        color: 'rgba(243,237,226,.84)', opacity: interpolate(f, [60, 76], [0, 1], clamp) * fade }}>
        数据来源：国家移民管理局（2026-10-20、2026-07）· 新华社（2026-08-20）· 海报新闻（2026-08-11）
      </div>
    </AbsoluteFill>
  );
};

const CityLabel: React.FC<{ x: number; y: number; zh: string; en: string; f: number; at: number; hi?: boolean; right?: boolean }> = ({ x, y, zh, en, f, at, hi, right }) => {
  const o = interpolate(f, [at, at + 10], [0, 1], clamp);
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: o, color: hi ? '#FFFDF8' : 'rgba(243,237,226,.78)', whiteSpace: 'nowrap', transform: right ? 'translateX(-100%)' : 'translateX(-50%)' }}>
      <span style={{ fontFamily: FONT.serifZh, fontSize: hi ? 40 : 32 }}>{zh}</span>
      <span style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: hi ? 30 : 26, marginLeft: 8, opacity: 0.75 }}>{en}</span>
    </div>
  );
};

const Arc: React.FC<{ f: number; from: [number, number]; start: number; z: number; fade: number }> = ({ f, from, start, z, fade }) => {
  const [x0, y0] = from, [x1, y1] = SH;
  const d = Math.hypot(x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - Math.min(d * 0.32, 170);
  const e = interpolate(f, [start, start + 22], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  if (e <= 0) return null;
  const path = `M${x0} ${y0}Q${cx} ${cy} ${x1} ${y1}`;
  const hx = (1 - e) ** 2 * x0 + 2 * (1 - e) * e * cx + e * e * x1, hy = (1 - e) ** 2 * y0 + 2 * (1 - e) * e * cy + e * e * y1;
  const ring = interpolate(f, [start + 22, start + 36], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const w = 1.6 / Math.sqrt(z);
  return (
    <g opacity={fade}>
      <path d={path} fill="none" stroke="rgba(241,210,154,.22)" strokeWidth={w * 4} pathLength={1} strokeDasharray={`${e} 2`} strokeLinecap="round" />
      <path d={path} fill="none" stroke={GOLD} strokeWidth={w} pathLength={1} strokeDasharray={`${e} 2`} strokeLinecap="round" />
      <circle cx={x0} cy={y0} r={3.2} fill={GOLD} />
      {e < 1 && <circle cx={hx} cy={hy} r={4.5} fill="#FFF3D6" />}
      {ring > 0 && ring < 1 && <circle cx={x1} cy={y1} r={9 + ring * 26} fill="none" stroke={GOLD} strokeWidth={1.4} opacity={1 - ring} />}
    </g>
  );
};
