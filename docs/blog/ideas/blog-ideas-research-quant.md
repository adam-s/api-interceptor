# Blog Ideas: Research & Quantitative Finance

12 blog ideas about ML experiments, look-ahead bias, research-production parity, and the systematic discovery that markets are efficient.

---

## 46. News Headlines Cannot Predict Stock Prices (And Here Is the Proof)

**Commits**: `bac760b2`, `9e8e07c9`, `1f6930c8`, `70bb8938`, `7202b45d`, `8c711dc3`, `73d6f45f`, `aadabb47`

**What Happened**: Multi-week ML arc: TF-IDF baseline at 58%, FinBERT ensemble at 62.8% with 91.1% accuracy on high-confidence predictions. Scaled up to 334K articles, GPT-4o-mini summarization, FinBERT fine-tuning on A100 GPUs, Longformer, Qwen2.5-3B LoRA. Scaled results: ~50% accuracy (random chance). Root cause: 30-minute publication delay means news is available *after* the price moved.

**The Story/Angle**: The difference between a promising pilot and a rigorous experiment. Initial 62.8% was real but built on concurrent (not predictive) correlation. When temporal leakage was eliminated, the signal vanished.

**Recommended Styles**:
- **Overreacted**: "The News Is Already in the Price." Start with the excitement of 62.8%, the scaling up, then the slow realization.
- **Soshnikov**: Temporal leakage, look-ahead bias in training splits, dual-model inference architecture, focal loss behavior.

---

## 47. From Macro Signals to Sector Rotation: A Quantitative Research Sprint

**Commits**: `59cfcbac`, `7c34e41b`, `f54e697a`, `1087b97e`, `00e356da`, `bb97fd2a`, `4b885cf1`, `83a69e24`

**What Happened**: Single-day research sprint: FRED data for 22 series, materialized views, systematic signal search. Findings: post-quarterly OpEx Monday 100% win rate (3/3 trades), stagflation + low vol predicts XLK (t=3.15), healthcare outperforms during Fed cutting cycles (t=2.04). Forward return validation caught coincident vs. predictive signals. OECD paradox: declining leading indicators → *higher* returns.

**The Story/Angle**: Speed-run through macro research with proper discipline. The OECD paradox is counterintuitive and makes a great hook. The composite model's Sharpe 17.3 is suspiciously good — an honest post would interrogate overfitting.

**Recommended Styles**:
- **Soshnikov**: Define regime classification, show SQL for materialized views, walk through t-statistics, demonstrate coincident vs. predictive with examples.
- **Overreacted**: "The Signal That Predicts the Opposite." Focus on the OECD paradox.

---

## 48. The 30-Minute Gap: Why Publication Delay Breaks Financial ML

**Commits**: `70bb8938`, `7202b45d`

**What Happened**: Financial news articles have ~30-minute publication delay from the underlying event. Any model trained on news + concurrent price is learning to *describe* what happened, not *predict* what will happen. Momentum features partially compensated (+7.2% accuracy) by using price movement as a proxy for not-yet-published news.

**The Story/Angle**: A tight, focused insight: the difference between when information *exists* and when it's *available to your system*. The momentum workaround reveals the circularity — using price to predict price.

**Recommended Styles**:
- **Overreacted**: "Information Exists Before You Can See It." Build pipeline, get results, realize the illusion.

*Note: Could fold into #46 as a section rather than standalone.*

---

## 49. When Your Model Works Too Well: Focal Loss, Dual Inference, and the Coverage-Accuracy Tradeoff

**Commits**: `9e8e07c9`, `70bb8938`

**What Happened**: Model A (gamma=2.0): 81.0% accuracy, 6.3% coverage at 75%+ confidence. Model B (gamma=1.5): 74.4% accuracy, 36.3% coverage. Solution: "max confidence wins" dual-model routing.

**The Story/Angle**: Focal loss is widely discussed but the practical coverage-accuracy tradeoff is rarely shown with real numbers. The dual-model pattern bridges "high accuracy on easy examples" and "some answer for every input."

**Recommended Styles**:
- **Soshnikov**: Focal loss formally, gamma's effect on the loss landscape, then the dual-model architecture.
- **A List Apart**: Argue that "accuracy" is incomplete — every ML system should report coverage at confidence thresholds.

---

## 50. The 78% Accuracy That Wasn't

**Commits**: `8843b600`, `5bdf4339`, `5dc986d2`, `a0d02efc`

**What Happened**: Options flow experiments showed 78.4% accuracy predicting SPY direction. Audit revealed a timezone bug: `AT TIME ZONE` returned 10:59 UTC instead of 4pm ET close. Corrected result: 61.7% (trivial "always predict up" baseline). Led to formal research best-practices document.

**The Story/Angle**: How easy it is to produce spectacular results with subtle data pipeline bugs. "Any accuracy >51% on financial data should trigger immediate skepticism."

**Recommended Styles**:
- **Overreacted**: From excitement (78%!) to skepticism to audit to deflation (baseline!). The emotional arc is universal.
- **Soshnikov**: How `AT TIME ZONE` works (and doesn't) in PostgreSQL, plus the formal validation checklist.

---

## 51. 100 Experiments, Zero Alpha — What I Learned Running a Systematic Research Pipeline

**Commits**: `8843b600`, `314cf4e2`, `4c1c0814`, `cc117ba0`, `b8a7bf69`, `657f5a5b`, `3e6c9036`, `ea992078`, `ae00809b`, `4bc2e289`, `07f62f55`, `f51b7d72`, `f74463cd`, `8a9ffc87`, `399deb46`, `d3161abf`

**What Happened**: Massive research: options flow (22+ experiments), calendar events (31), SEC 8-K (23), extrinsic value, risk rotation. Conclusion: markets efficiently price public information. Individual stock options flow has no predictive power. Calendar events produce no tradeable equity signals. The few exceptions: volatility space, not directional equity.

**The Story/Angle**: The antidote to every "I built an ML model that beats the market" blog post. The honesty of 100+ experiments reporting that almost nothing works. "The signal is in volatility, not direction" only emerges from the pattern of systematic failure.

**Recommended Styles**:
- **A List Apart**: "Systematic negative results are more valuable than cherry-picked positive ones." Analogy: pharmaceutical trials — most drugs fail, and that's the point.
- **Overreacted**: The personal journey from optimism through "nothing works" to nuanced understanding.

---

## 52. The Look-Ahead Bias That Ate Our Alpha

**Commits**: `d66f49e8`, `5dc25b79`, `a53751f6`, `cee7e49e`, `c000d0cd`, `90fc8b81`

**What Happened**: Cooldown used T+1 returns to block same-day (T) signals — information unavailable at decision time. v3 Sharpe +9.86 was entirely look-ahead bias. Corrected v4: +0.25 (not significant). Signal count jumped 76% with correct cooldown. Complete rewrite of breadth consensus service.

**The Story/Angle**: A classic quant horror story. The bias was hard to catch because cooldown using next-day returns seems plausible in a batch context. The emotional arc of Sharpe 9.86 collapsing to 0.25.

**Recommended Styles**:
- **Overreacted**: Drop into the specific moment of running the corrected backtest. The reveal is devastating.
- **Soshnikov**: The precise mechanism — why delayed P&L evaluation is necessary, how T+1 returns leak into T decisions.

---

## 53. Three Signal Systems and a Funeral: Knowing When to Delete 30,000 Lines

**Commits**: `9800379e`, `850512c0`, `990551bd`, `4905f23f`, `a53751f6`

**What Happened**: Three entire signal systems deleted (Laplace, signals/signals2, flow-regime) — 60,000+ lines removed. Final architecture: single Python worker (breadth-consensus) with unified IPC bridge.

**The Story/Angle**: Celebrating what was deleted, not what was built. Each system taught something that informed the next, but none survived. Less code meant more reliable production parity.

**Recommended Styles**:
- **Overreacted**: The emotional journey of building, proving, then killing systems.
- **A List Apart**: "Code deletion is a feature." Analogy: sculpture — removing marble to reveal the form.

---

## 54. Achieving 100% Signal Parity Between Research and Production

**Commits**: `ba21a690`, `04cf23c5`, `66fdf5b2`, `7bd5c57c`, `a53751f6`

**What Happened**: Seven parity bugs found and fixed: bucket look-ahead (batch pivot included future columns), stale prev_price (DataFrame shift with gaps), backward gap-fill pricing (`DISTINCT ON ... ORDER BY time DESC`), overnight filter direction (forward → backward-looking), LEFT vs INNER join, missing Carter holiday, unstable pandas quicksort.

**The Story/Angle**: Research-production parity is the holy grail, and most teams accept drift. Each bug is a detective story. "Close enough" parity hides real alpha leakage.

**Recommended Styles**:
- **CSS-Tricks**: "Seven Deadly Sins of Research-Production Parity" — each bug class with detection method, fix, and code.
- **Soshnikov**: Precision required for DTE-30 filter and overnight filter direction.

---

## 55. The Research Experiment Factory: 80 Experiments in 80 Commits

**Commits**: `6a1223c8`, `1b0a6469`, `7936c831`, `b0742387`, `76363ca9`, `442eb550`, `538dc0e9`, `e468db11`, `ecea12a4`, `27b6ec8c`, `a77ce17c`, `7e4f5358`, `ca4d81ba`, `a25f9bef`, `d66f49e8`, `5dc25b79`, `c1c68301`

**What Happened**: Massive campaign: credit spreads (20 experiments), VXX rotation (15), flow clustering, call/put ratios, breadth variants, portfolio optimization with Optuna. Shared 15-proof audit framework. Winning strategy (DD Protection): Sharpe 1.32, -6.4% max DD.

**The Story/Angle**: Focus on the infrastructure that makes 80+ experiments tractable: audit framework, structured directories, Optuna integration. The experiment that finds the winner is the one that also found 79 losers.

**Recommended Styles**:
- **CSS-Tricks**: "Complete Guide to Building a Research Experiment Factory."
- **A List Apart**: "The Case for Experiment Infrastructure" — investing in tooling pays off exponentially.

---

## 56. When Deep Learning Loses to `if` Statements: VXX Regime Trading

**Commits**: `c3b2bd46`, `47b1fda3`, `4a5cbee5`, `98dd7761`, `fb2f7d1e`

**What Happened**: VXX regime strategy (Sharpe 4.18), TSLA IV-zscore overnight holds (Sharpe 12.45 OOS). LSTM and Transformer both lost to hand-crafted rules. Overlapping positions solved a -65% → -24% max drawdown problem. 12-proof audit framework for backtest validity.

**The Story/Angle**: Simple rules beat complex models for regime trading because alpha comes from knowing *what* to look at (VXX trend, IV z-scores), not from nonlinear pattern recognition. The 12-proof audit is the real contribution.

**Recommended Styles**:
- **A List Apart**: "Rules beat models for regime trading, and here's a framework to prove your backtest is honest."
- **Overreacted**: The journey from excitement about high Sharpe to suspicion and verification.

---

## 57. Research-to-Production Parity: The Laplace Signal Bridge

**Commits**: `457015e2`, `cfa42a21`, `9388a286`, `cbd8e85f`, `c2e48bbe`, `3ef8651e`

**What Happened**: Laplace z-score from Python → TypeScript production. Initial fixtures: 0/6 z-scores correct (tests passing for wrong reasons). Required regenerating fixtures, Python bridge for bias-corrected parity (experiment 021), `StrategyAdapter` pattern, and 6 composable exit evaluators (stop-loss, take-profit, trailing stop, signal reversal, max hold days, min hold signal).

**The Story/Angle**: The gap between "works in a notebook" and "works in production." 0/6 correct z-scores means the tests were passing for the wrong reasons — a cautionary tale about testing statistical systems.

**Recommended Styles**:
- **Soshnikov**: Z-score validation, bias correction, numerical parity between two language runtimes.
- **Overreacted**: The "0/6 correct" discovery as narrative hook.
