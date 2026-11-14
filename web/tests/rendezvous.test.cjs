const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../physics.js');
const near = (a,b,t) => assert.ok(Math.abs(a-b)<=t, `${a} != ${b}`);
test('All 72 routes meet their target over six non-ideal phases', () => {
  for (const a of Object.keys(P.planets)) for (const b of Object.keys(P.planets)) {
    if (a === b) continue;
    for (const phase of [-180,-90,0,45,90,180]) {
      const m = P.rendezvous(a,b,1000,phase);
      assert.ok(P.arrivalMiss(m,phase)<1, `${a}/${b}/${phase}`);
      const start = P.spacecraft(m,0);
      near(start.x,m.r1/P.AU,1e-7); near(start.y,0,1e-7);
      assert.ok(m.days>=m.search.minDays-1e-7 && m.days<=m.search.maxDays+1e-7);
      for (const fraction of [.1,.5,.9]) {
        const s = P.spacecraft(m,fraction);
        near(s.speed*s.speed/2-P.MU/(s.r*P.AU),-P.MU/(2*m.a),1e-7);
      }
    }
  }
});
test('Ideal phase retains exact Hohmann, other phases change trajectory, time and vector impulses', () => {
  const h = P.transfer(), m = P.rendezvous('earth','mars',1000,h.phase);
  near(m.days,h.days,0); near(m.dv,h.dv,0);
  for (const phase of [h.phase+25,-90,0,180]) {
    const alt = P.rendezvous('earth','mars',1000,phase);
    assert.ok(Math.abs(alt.days-h.days)>1); assert.ok(alt.dv>h.dv);
    assert.ok(alt.dv1>=Math.abs(alt.vt1-alt.v1)-1e-10);
  }
  assert.equal(P.rendezvous('earth','mars',1000,h.phase+360).kind,'hohmann');
  assert.throws(()=>P.rendezvous('earth','mars',1000,NaN),RangeError);
});
test('Independent RK4 integration of departure state agrees with Lambert rendezvous', () => {
  for (const phase of [-180,0,69.344,90]) {
    const m = P.rendezvous('earth','mars',1000,phase);
    let s = [m.r1,0,m.departureVelocity.x,m.departureVelocity.y];
    const dt = m.seconds/6000;
    const derivative = s => { const k=-P.MU/Math.hypot(s[0],s[1])**3; return [s[2],s[3],k*s[0],k*s[1]]; };
    const add=(s,k,h)=>s.map((v,i)=>v+h*k[i]);
    for(let i=0;i<6000;i++) {
      const a=derivative(s),b=derivative(add(s,a,dt/2)),c=derivative(add(s,b,dt/2)),d=derivative(add(s,c,dt));
      s=s.map((v,j)=>v+dt/6*(a[j]+2*b[j]+2*c[j]+d[j]));
    }
    const target=P.planetPositions(m,1,phase).destination;
    assert.ok(Math.hypot(s[0]-target.x*P.AU,s[1]-target.y*P.AU)<.2);
    near(s[2],m.arrivalVelocity.x,1e-6); near(s[3],m.arrivalVelocity.y,1e-6);
  }
});
test('Mass scales kinetic energy without changing orbit or delta-v; energy is not a fuel proxy', () => {
  const m=P.rendezvous('earth','mars',1000,70),d=P.rendezvous('earth','mars',2000,70),h=P.transfer();
  near(d.energyMJ,2*m.energyMJ,1e-6); near(d.days,m.days,0); near(d.dv,m.dv,0);
  near(m.energyMJ,h.energyMJ,1e-5); assert.ok(m.dv>h.dv);
});
