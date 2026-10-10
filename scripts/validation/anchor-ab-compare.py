import json, sys, math, itertools, os

def load(p):
    d = json.load(open(p))
    return d, {r["gameId"]: r for r in d["rows"]}

dn, new = load(sys.argv[1])
do, old = load(sys.argv[2])
ids = sorted(set(new) & set(old))
print(f"paired games: {len(ids)}   (new rows {len(new)}, old rows {len(old)})")
print("NEW constants:", {k: round(v,6) for k,v in dn["constants"].items()})
print("OLD constants:", {k: round(v,6) for k,v in do["constants"].items()})
print()

pn = [new[i]["nrfiProbability"] for i in ids]
po = [old[i]["nrfiProbability"] for i in ids]
y  = [new[i]["y"] for i in ids]
assert y == [old[i]["y"] for i in ids], "outcome mismatch"

d = [a-b for a,b in zip(pn,po)]
mean_d = sum(d)/len(d)
sd_d = math.sqrt(sum((x-mean_d)**2 for x in d)/(len(d)-1)) if len(d)>1 else 0.0
print("--- is the change a pure affine shift of the final probability? ---")
print(f"delta mean      {mean_d:+.6f}")
print(f"delta sd        {sd_d:.6f}      (0 => pure constant shift)")
print(f"delta min/max   {min(d):+.6f} / {max(d):+.6f}   spread {max(d)-min(d):.6f}")

# An affine map p_new = a*p_old + b would make the delta a perfect linear
# function of p_old.  Check the residual from the best-fit line.
n=len(ids)
mx=sum(po)/n; my=sum(pn)/n
sxx=sum((x-mx)**2 for x in po); sxy=sum((x-mx)*(yy-my) for x,yy in zip(po,pn))
a = sxy/sxx; b = my - a*mx
res=[yy-(a*x+b) for x,yy in zip(po,pn)]
rss=math.sqrt(sum(r*r for r in res)/n)
print(f"best-fit affine  p_new = {a:.6f}*p_old {b:+.6f}")
print(f"residual RMS     {rss:.8f}   max |resid| {max(abs(r) for r in res):.8f}")
print(f"  (0 => exactly affine => ordering provably preserved)")
print()

print("--- does the ORDERING change? ---")
conc=disc=tie=0
for i,j in itertools.combinations(range(n),2):
    so = po[i]-po[j]; sn = pn[i]-pn[j]
    if so==0 or sn==0: tie+=1
    elif so*sn>0: conc+=1
    else: disc+=1
tot=conc+disc+tie
tau=(conc-disc)/tot if tot else float('nan')
print(f"pairs {tot}: concordant {conc}, DISCORDANT {disc}, tied {tie}")
print(f"Kendall tau-a   {tau:.6f}   (1.0 => identical ordering)")
print(f"inverted pairs  {disc}  ({100*disc/tot:.3f}% of all pairs)")
print()

def auc(probs, ys):
    pos=[p for p,t in zip(probs,ys) if t==1]; neg=[p for p,t in zip(probs,ys) if t==0]
    if not pos or not neg: return float('nan')
    s=0.0
    for a_ in pos:
        for b_ in neg:
            s += 1.0 if a_>b_ else (0.5 if a_==b_ else 0.0)
    return s/(len(pos)*len(neg))
def brier(probs, ys): return sum((p-t)**2 for p,t in zip(probs,ys))/len(ys)
def logloss(probs, ys):
    e=1e-12
    return -sum(t*math.log(max(p,e))+(1-t)*math.log(max(1-p,e)) for p,t in zip(probs,ys))/len(ys)
def acc(probs, ys): return sum(1 for p,t in zip(probs,ys) if (p>=0.5)==(t==1))/len(ys)

print("--- scored metrics on the paired games ---")
print(f"base rate (NRFI) {sum(y)/len(y):.5f}   n={len(y)}")
for nm,f in (("AUC",auc),("Brier",brier),("LogLoss",logloss),("Accuracy",acc)):
    vn=f(pn,y); vo=f(po,y)
    print(f"{nm:9s} old {vo:.6f}   new {vn:.6f}   delta {vn-vo:+.6f}")

# ── paired bootstrap on the metric deltas ─────────────────────────────────────
import random
def boot(fn, B=2000, seed=20261010):
    rng=random.Random(seed); n=len(ids); ds=[]
    for _ in range(B):
        idx=[rng.randrange(n) for _ in range(n)]
        yy=[y[k] for k in idx]
        if len(set(yy))<2: continue
        ds.append(fn([pn[k] for k in idx], yy) - fn([po[k] for k in idx], yy))
    ds.sort()
    return ds[int(.025*len(ds))], ds[int(.975*len(ds))], sum(1 for x in ds if x<0)/len(ds)

print()
print("--- paired bootstrap, 2000 resamples ---")
for nm,f,better in (("AUC",auc,"higher"),("Brier",brier,"lower"),("LogLoss",logloss,"lower")):
    lo,hi,pneg=boot(f)
    print(f"{nm:8s} delta 95% CI [{lo:+.6f}, {hi:+.6f}]   P(delta<0)={pneg:.3f}   ({better} is better)")

# ── why ordering survives (or not): perturbation vs neighbour gap ─────────────
print()
print("--- mechanism: is the perturbation smaller than the gaps it must cross? ---")
sp=sorted(po); gaps=[sp[i+1]-sp[i] for i in range(len(sp)-1)]
gaps_sorted=sorted(gaps)
rel=[d[i]-mean_d for i in range(n)]   # delta after removing the common shift
print(f"n={n}; adjacent-gap median {gaps_sorted[len(gaps)//2]:.6f}, "
      f"10th pct {gaps_sorted[int(.1*len(gaps))]:.6f}, min {gaps_sorted[0]:.6f}")
print(f"de-meaned delta: sd {math.sqrt(sum(r*r for r in rel)/(n-1)):.6f}, "
      f"max |.| {max(abs(r) for r in rel):.6f}, range {max(rel)-min(rel):.6f}")
print(f"gaps smaller than the de-meaned delta RANGE: "
      f"{sum(1 for g in gaps if g < (max(rel)-min(rel)))} / {len(gaps)}")

# Usage:
#   python3 scripts/validation/anchor-ab-compare.py <new.json> <old.json>
#
# Reads two anchor-ab-harness.ts outputs over the same games and reports:
#   - whether the change is a pure affine shift of the final probability
#     (residual RMS 0 => ordering provably preserved; nonzero => measure it)
#   - Kendall tau-a and the exact count of inverted pairs
#   - AUC / Brier / log-loss / accuracy with paired-bootstrap CIs on the deltas
#   - the gap/perturbation comparison that explains WHY ordering does or
#     does not survive
