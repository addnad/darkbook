'use client';

import { useState, useEffect } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useSubmitIntent, pollForSettlement, pollForRouting, type IntentResult } from '@/lib/useSubmitIntent';
import Ticker from '@/components/ticker';
import TradeHistory from '@/components/trade-history';
import PendingIntents from '@/components/pending-intents';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GodRays, MeshGradient } from '@paper-design/shaders-react';

export default function Hero() {
	const [isExpanded, setIsExpanded] = useState(false);
	const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
	const [amount, setAmount] = useState('');
	const [minPrice, setMinPrice] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [intentResult, setIntentResult] = useState<IntentResult | null>(null);
	const [submitError, setSubmitError] = useState('');
	const [historyRefresh, setHistoryRefresh] = useState(0);
	const account = useCurrentAccount();
	const { submitIntent } = useSubmitIntent();

	const handleExpand = () => setIsExpanded(true);
	const handleClose = () => setIsExpanded(false);

	const handleSubmit = async () => {
		if (!account || !amount || !minPrice) return;
		setIsSubmitting(true);
		setSubmitError('');
		try {
			const result = await submitIntent({
				side,
				amountSui: parseFloat(amount),
				minPriceUsd: parseFloat(minPrice),
			});
			setIntentResult(result);
			setHistoryRefresh(n => n + 1);
			if (result.status === 'pending' && account) {
				const submittedAt = Date.now();
				const controller = new AbortController();
				pollForSettlement(account.address, submittedAt, (settled) => {
					setIntentResult(settled);
					setHistoryRefresh(n => n + 1);
				}, controller.signal);
			}
		} catch (err: any) {
			setSubmitError(err.message || 'Something went wrong');
		} finally {
			setIsSubmitting(false);
		}
	};

	useEffect(() => {
		if (isExpanded) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = 'unset';
		}
	}, [isExpanded]);

	return (
		<>
			<div className="relative flex min-h-screen flex-col items-center justify-center px-4 sm:px-6 py-12 sm:py-20">
				<div className="absolute inset-0">
					<GodRays
						colorBack="#00000000"
						colors={['#FFFFFF6E', '#F3F3F3F0', '#8A8A8A', '#989898']}
						colorBloom="#FFFFFF"
						offsetX={0.85}
						offsetY={-1}
						intensity={1}
						spotty={0.45}
						midSize={10}
						midIntensity={0}
						density={0.12}
						bloom={0.15}
						speed={1}
						scale={1.6}
						frame={3332042.8159981333}
						style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
					/>
				</div>

				<div className="relative z-10 flex flex-col items-center gap-4 sm:gap-6 text-center">
					<h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-normal leading-[90%] tracking-[-0.03em] text-black mix-blend-exclusion max-w-2xl">
						Trade large blocks. Leave no trace.
					</h1>
					<p className="text-base sm:text-lg md:text-xl leading-[160%] text-black max-w-2xl px-4">
						Post a signed intent off-chain specifying side, amount, and minimum acceptable price — nothing is visible on-chain.
					</p>
					<AnimatePresence initial={false}>
						{!isExpanded && (
							<motion.div className="inline-block relative">
								<motion.div
									style={{ borderRadius: '100px' }}
									layout
									layoutId="cta-card"
									className="absolute inset-0 bg-[#004FE5] items-center justify-center transform-gpu will-change-transform"
								/>
								<motion.button
									initial={{ opacity: 0, scale: 0.8 }}
									animate={{ opacity: 1, scale: 1 }}
									transition={{ delay: 0.2 }}
									exit={{ opacity: 0, scale: 0.8 }}
									layout={false}
									onClick={handleExpand}
									className="h-15 px-6 sm:px-8 py-3 text-lg sm:text-xl font-regular text-[#E3E3E3] tracking-[-0.01em] relative"
								>
									Launch App
								</motion.button>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</div>

			<AnimatePresence initial={false}>
				{isExpanded && (
					<div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-2">
						<motion.div
							layoutId="cta-card"
							style={{ borderRadius: '24px' }}
							layout
							className="relative flex h-full w-full overflow-hidden bg-[#004FE5] transform-gpu will-change-transform"
						>
							<div className="h-full w-full overflow-y-auto scrollbar-hide">
								<motion.div
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									className="relative z-10 min-h-full flex flex-col w-full max-w-[1100px] mx-auto p-6 sm:p-10 lg:p-16 gap-6"
								>
									{/* Ticker strip */}
									<div className="w-full overflow-hidden border-b border-white/10 pb-3">
										<Ticker dark={true} />
									</div>

									{/* Two column content */}
									<div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16 flex-1">
										<div className="flex-1 flex flex-col justify-center space-y-3 w-full">
											<h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium text-white leading-none tracking-[-0.03em]">
												How DarkBook works
											</h2>
											<div className="space-y-4 sm:space-y-6 pt-4">
												<div className="flex gap-3 sm:gap-4">
													<div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-white/10 flex items-center justify-center">
														<svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
														</svg>
													</div>
													<div>
														<p className="text-sm sm:text-base text-white leading-[150%]">
															Post a signed intent off-chain specifying side, amount, and your minimum acceptable price — nothing is visible on-chain.
														</p>
													</div>
												</div>
												<div className="flex gap-3 sm:gap-4">
													<div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-white/10 flex items-center justify-center">
														<svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
														</svg>
													</div>
													<div>
														<p className="text-sm sm:text-base text-white leading-[150%]">
															Matched intents settle atomically through a Move vault — the trade is final before it ever appears on-chain.
														</p>
													</div>
												</div>
												<div className="flex gap-3 sm:gap-4">
													<div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-white/10 flex items-center justify-center">
														<svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
														</svg>
													</div>
													<div>
														<p className="text-sm sm:text-base text-white leading-[150%]">
															No peer match within 2 minutes? Your intent routes automatically to DeepBook V3 for guaranteed fill.
														</p>
													</div>
												</div>
											</div>
											<div className="pt-6 sm:pt-8 mt-6 sm:mt-8 border-t border-white/20">
												<p className="text-lg sm:text-xl lg:text-2xl text-white leading-[150%] mb-4">
													DarkBook keeps your strategy private. Front-running is impossible because there is nothing to front-run.
												</p>
												<div className="flex items-center gap-3 sm:gap-4">
													<div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 flex items-center justify-center">
														<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
														</svg>
													</div>
													<div>
														<p className="text-base sm:text-lg lg:text-xl text-white">Private OTC Dark Pool</p>
														<p className="text-sm sm:text-base text-white/70">Sui Overflow 2026 · DeepBook Track</p>
													</div>
												</div>
											</div>
										</div>

										<div className="flex-1 w-full">
											<form className="space-y-4 sm:space-y-5" onSubmit={e => e.preventDefault()}>
												<div>
													<div className="flex gap-2">
														<button type="button" onClick={() => setSide('BUY')} className={`flex-1 px-8 py-2.5 rounded-full font-medium hover:bg-white/90 transition-colors tracking-[-0.03em] h-10 text-sm focus:outline-none ${side === 'BUY' ? 'bg-white text-[#0041C1]' : 'bg-white/20 text-white'}`}>
															BUY
														</button>
														<button type="button" onClick={() => setSide('SELL')} className={`flex-1 px-8 py-2.5 rounded-full font-medium hover:bg-white/90 transition-colors tracking-[-0.03em] h-10 text-sm focus:outline-none ${side === 'SELL' ? 'bg-white text-[#0041C1]' : 'bg-white/20 text-white'}`}>
															SELL
														</button>
													</div>
												</div>
												<div>
													<label className="block text-[10px] font-mono font-normal text-white mb-2 tracking-[0.5px] uppercase">PAIR *</label>
													<select id="pair" name="pair" className="w-full px-4 py-2.5 rounded-lg bg-[#001F63] border-0 text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all appearance-none cursor-pointer text-sm h-10" style={{backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1rem'}}>
														<option value="SUI/USDC">SUI/USDC</option>
														<option value="SUI/USDT">SUI/USDT</option>
														<option value="DEEP/SUI">DEEP/SUI</option>
														<option value="DEEP/USDC">DEEP/USDC</option>
													</select>
												</div>
												<div className="flex flex-col sm:flex-row gap-4">
													<div className="flex-1">
														<label className="block text-[10px] font-mono font-normal text-white mb-2 tracking-[0.5px] uppercase">AMOUNT</label>
														<input type="number" id="amount" name="amount" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-[#001F63] border-0 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm h-10" />
													</div>
													<div className="sm:w-32 w-full">
														<label className="block text-[10px] font-mono font-normal text-white mb-2 tracking-[0.5px] uppercase">MIN PRICE</label>
														<input type="number" id="minPrice" name="minPrice" placeholder="0.00" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-[#001F63] border-0 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm h-10" />
													</div>
												</div>
												{submitError && <p className="text-red-300 text-xs px-1">{submitError}</p>}
												<button type="button" onClick={handleSubmit} disabled={!account || !amount || !minPrice || isSubmitting} className="w-full px-8 py-2.5 rounded-full bg-white text-[#0041C1] font-medium hover:bg-white/90 transition-colors tracking-[-0.03em] h-10 disabled:opacity-50 disabled:cursor-not-allowed">
													{isSubmitting ? 'Submitting...' : !account ? 'Connect wallet to continue' : 'Submit Intent'}
												</button>
											</form>
											<TradeHistory onRefresh={historyRefresh} />
											<PendingIntents />
										</div>
									</div>
								</motion.div>

								{intentResult && (
									<div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-2">
										<div className="relative flex h-full w-full overflow-hidden bg-[#004FE5] rounded-[24px] transform-gpu">
											<div className="h-full w-full overflow-y-auto">
												<div className="relative z-10 min-h-full flex flex-col items-center justify-center w-full max-w-[600px] mx-auto p-6 sm:p-10 lg:p-16 gap-6 text-center">
													<div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
														<svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
														</svg>
													</div>
													{intentResult.status === 'matched' ? (
														<>
															<h2 className="text-3xl sm:text-4xl font-medium text-white tracking-[-0.03em]">Trade Settled</h2>
															<p className="text-white/70 text-base">Your intent was matched and settled atomically on Sui.</p>
															<div className="w-full bg-white/10 rounded-xl p-5 text-left space-y-3">
																<div className="flex justify-between text-sm"><span className="text-white/60 font-mono uppercase tracking-widest">Venue</span><span className="text-white font-medium">DarkBook Dark Pool</span></div>
																<div className="flex justify-between text-sm"><span className="text-white/60 font-mono uppercase tracking-widest">Agreed Price</span><span className="text-white font-medium">${(intentResult.price / 1_000_000).toFixed(4)}</span></div>
																<div className="flex justify-between text-sm"><span className="text-white/60 font-mono uppercase tracking-widest">Matched With</span><span className="text-white font-medium">{intentResult.matchedWith.slice(0,6)}…{intentResult.matchedWith.slice(-4)}</span></div>
																<div className="flex justify-between text-sm"><span className="text-white/60 font-mono uppercase tracking-widest">Digest</span><span className="text-white font-medium text-xs">{intentResult.digest.slice(0,8)}…{intentResult.digest.slice(-6)}</span></div>
															</div>
														</>
													) : (
														<>
															<h2 className="text-3xl sm:text-4xl font-medium text-white tracking-[-0.03em]">Intent Submitted</h2>
															<p className="text-white/70 text-base">No match found yet — your intent is queued. Routes to DeepBook V3 in 2 minutes if unmatched.</p>
															<div className="w-full bg-white/10 rounded-xl p-5 text-left space-y-3">
																<div className="flex justify-between text-sm"><span className="text-white/60 font-mono uppercase tracking-widest">Status</span><span className="text-white font-medium">Pending Match</span></div>
																<div className="flex justify-between text-sm"><span className="text-white/60 font-mono uppercase tracking-widest">Fallback</span><span className="text-white font-medium">DeepBook V3</span></div>
																<div className="flex justify-between text-sm"><span className="text-white/60 font-mono uppercase tracking-widest">Intent ID</span><span className="text-white font-medium text-xs">{intentResult.intentId.slice(0,8)}…</span></div>
															</div>
														</>
													)}
													<button onClick={() => { setIntentResult(null); setAmount(''); setMinPrice(''); }} className="px-8 py-2.5 rounded-full bg-white text-[#0041C1] font-medium hover:bg-white/90 transition-colors tracking-[-0.03em] h-10">
														Done
													</button>
												</div>
											</div>
											<div className="absolute h-full inset-0 overflow-hidden pointer-events-none rounded-[24px]">
												<MeshGradient speed={1} colors={['#2452F1', '#022474', '#163DB9', '#0B1D99']} distortion={0.8} swirl={0.1} grainMixer={0} grainOverlay={0} className="inset-0 sticky top-0" style={{ height: '100%', width: '100%' }} />
											</div>
										</div>
									</div>
								)}
							</div>
							<motion.div
								initial={{ opacity: 0, scale: 2 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0 }}
								layout={false}
								transition={{ duration: 0.15, delay: 0.05 }}
								className="absolute h-full inset-0 overflow-hidden pointer-events-none"
								style={{ borderRadius: '24px' }}
							>
								<MeshGradient
									speed={1}
									colors={['#2452F1', '#022474', '#163DB9', '#0B1D99']}
									distortion={0.8}
									swirl={0.1}
									grainMixer={0}
									grainOverlay={0}
									className="inset-0 sticky top-0"
									style={{ height: '100%', width: '100%' }}
								/>
							</motion.div>
							<motion.button
								onClick={handleClose}
								className="absolute right-6 top-6 z-10 flex h-10 w-10 items-center justify-center text-white bg-transparent transition-colors hover:bg-white/10 rounded-full"
								aria-label="Close"
							>
								<X className="h-5 w-5" />
							</motion.button>
						</motion.div>
					</div>
				)}
			</AnimatePresence>
		</>
	);
}
