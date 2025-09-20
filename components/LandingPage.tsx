import React, { useState } from 'react';
import { SparklesIcon, MenuIcon, CloseIcon, TrendingUpIcon, ScissorsIcon, FireIcon, QuoteIcon } from './IconComponents.tsx';
import TypewriterText from './TypewriterText.tsx';
import FadeInSection from './FadeInSection.tsx';

interface LandingPageProps {
  onGetStarted: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <header className="bg-black/70 backdrop-blur sticky top-0 z-10">
        <nav className="max-w-6xl mx-auto flex justify-between items-center p-4">
          <h1
            className="glitch text-3xl font-bold text-white"
            data-text="CineSynth"
            style={{ fontFamily: 'Fira Code' }}
          >
            CineSynth
          </h1>
          <div className="hidden sm:flex items-center gap-6">
            <a href="#features" className="hover:text-gray-300 transition-colors">Features</a>
            <button
              className="bg-white text-black px-4 py-2 rounded-md shadow-lg hover:bg-gray-200"
              onClick={onGetStarted}
            >
              Launch App
            </button>
          </div>
          <button
            className="sm:hidden p-2 rounded-md hover:bg-gray-800"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <CloseIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
          </button>
        </nav>
        {menuOpen && (
          <div className="sm:hidden fixed inset-0 bg-black/90 backdrop-blur flex flex-col items-center justify-center space-y-6 z-50 min-h-screen">
            <a href="#features" className="text-2xl" onClick={() => setMenuOpen(false)}>Features</a>
            <button
              className="bg-white text-black px-6 py-3 rounded-md text-lg shadow-lg hover:bg-gray-200"
              onClick={() => { setMenuOpen(false); onGetStarted(); }}
            >
              Launch App
            </button>
            <button className="absolute top-4 right-4 p-2" onClick={() => setMenuOpen(false)}>
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>
        )}
      </header>
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 pt-24">
        <h2 className="text-4xl sm:text-6xl font-extrabold mb-6 bg-gradient-to-br from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent leading-tight min-h-[5rem] sm:min-h-[6rem]">
          <TypewriterText
            phrases={[
              'The Viral Attention Machine',
              'Unleash Controversy on Command',
              'Weaponize Your Words',
            ]}
          />
        </h2>
        <p className="text-lg sm:text-2xl text-gray-300 max-w-3xl mb-8">
          Trash the tedious edits. CineSynth weaponizes your script into viral ammo in minutes&mdash;perfect for creators who crave unstoppable engagement.
        </p>

        <button
          onClick={onGetStarted}
          className="bg-white text-black text-lg px-8 py-4 rounded-full shadow-xl flex items-center gap-2 hover:bg-gray-200"
        >
          <SparklesIcon className="w-6 h-6" />
          Get Started
        </button>

        <div id="features" className="flex overflow-x-auto snap-x snap-mandatory scroll-pl-4 sm:scroll-pl-0 gap-4 w-full max-w-4xl mt-12 mb-8 text-left px-2 no-scrollbar sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:snap-none">
          <FadeInSection>
            <div className="relative p-6 bg-black/60 backdrop-blur-lg border border-gray-700 rounded-xl overflow-hidden group snap-center shrink-0 w-72 sm:w-auto">
              <div className="absolute -top-5 -right-5 w-24 h-24 bg-fuchsia-500/40 rounded-full blur-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-500" />
              <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <TrendingUpIcon className="relative z-10 w-8 h-8 text-white mb-3" />
              <h3 className="relative z-10 font-semibold text-white group-hover:text-fuchsia-200 transition-colors duration-500">Trend Analysis</h3>
              <p className="relative z-10 text-gray-400 group-hover:text-gray-200 text-sm mt-1 transition-colors duration-500">AI exploits your audience's hidden desires so your message lands like an obsession.</p>
            </div>
          </FadeInSection>
          <FadeInSection>
            <div className="relative p-6 bg-black/60 backdrop-blur-lg border border-gray-700 rounded-xl overflow-hidden group snap-center shrink-0 w-72 sm:w-auto">
              <div className="absolute -top-5 -right-5 w-24 h-24 bg-fuchsia-500/40 rounded-full blur-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-500" />
              <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <ScissorsIcon className="relative z-10 w-8 h-8 text-white mb-3" />
              <h3 className="relative z-10 font-semibold text-white group-hover:text-fuchsia-200 transition-colors duration-500">No Editing Required</h3>
              <p className="relative z-10 text-gray-400 group-hover:text-gray-200 text-sm mt-1 transition-colors duration-500">Just speak. We forge visuals and audio into one seamless shockwave.</p>
            </div>
          </FadeInSection>
          <FadeInSection>
            <div className="relative p-6 bg-black/60 backdrop-blur-lg border border-gray-700 rounded-xl overflow-hidden group snap-center shrink-0 w-72 sm:w-auto">
              <div className="absolute -top-5 -right-5 w-24 h-24 bg-fuchsia-500/40 rounded-full blur-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-500" />
              <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <FireIcon className="relative z-10 w-8 h-8 text-white mb-3" />
              <h3 className="relative z-10 font-semibold text-white group-hover:text-fuchsia-200 transition-colors duration-500">Controversy Ready</h3>
              <p className="relative z-10 text-gray-400 group-hover:text-gray-200 text-sm mt-1 transition-colors duration-500">Crank up the drama and ignite outrage&mdash;no editing nightmares.</p>
            </div>
          </FadeInSection>
        </div>

        <section className="w-full py-12 border-t border-gray-800 mt-8">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 items-center p-8 md:p-12">
            <div className="space-y-4">
              <h3 className="text-3xl font-bold">AI-Fueled Content Domination</h3>
              <p className="text-gray-300">
                Amplify your message with ruthless analysis, hands-free editing and flawless voice sync.
              </p>
              <ul className="space-y-3 text-left text-gray-300">
                <li className="flex items-start gap-2">
                  <SparklesIcon className="w-5 h-5 text-fuchsia-400" />
                  <span>Behavior mining that taps hidden desires</span>
                </li>
                <li className="flex items-start gap-2">
                  <ScissorsIcon className="w-5 h-5 text-fuchsia-400" />
                  <span>Relentless auto edits keep your message razor sharp</span>
                </li>
                <li className="flex items-start gap-2">
                  <FireIcon className="w-5 h-5 text-fuchsia-400" />
                  <span>Psychological hooks that magnetize engagement</span>
                </li>
              </ul>
            </div>
            <div className="relative aspect-video bg-black/60 backdrop-blur-lg border border-gray-700 rounded-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/40 via-transparent to-transparent rounded-2xl pointer-events-none" />
              <div className="absolute inset-4 border border-dashed border-gray-600 rounded-xl pointer-events-none" />
              <div className="flex items-center justify-center h-full text-gray-500">Video Preview</div>
            </div>
          </div>
        </section>

        <section className="w-full py-12 border-t border-gray-800">
          <h3 className="text-3xl font-bold mb-8 text-center">What Our Users Say</h3>
          <div className="grid gap-4 sm:grid-cols-3 sm:gap-6 max-w-5xl mx-auto text-left">
            <FadeInSection>
              <div className="relative p-6 bg-black/60 backdrop-blur-lg border border-gray-700 rounded-xl overflow-hidden group">
              <div className="absolute -top-5 -right-5 w-24 h-24 bg-cyan-500/40 rounded-full blur-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-500" />
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <QuoteIcon className="relative z-10 w-6 h-6 mb-2 text-white/80" />
              <p className="relative z-10 text-gray-300 group-hover:text-gray-200 italic text-sm mb-3">&quot;This tool supercharged our marketing videos. Nothing else compares!&quot;</p>
              <span className="relative z-10 text-white font-semibold group-hover:text-cyan-200">— Alex R.</span>
              </div>
            </FadeInSection>
            <FadeInSection>
              <div className="relative p-6 bg-black/60 backdrop-blur-lg border border-gray-700 rounded-xl overflow-hidden group">
              <div className="absolute -top-5 -right-5 w-24 h-24 bg-cyan-500/40 rounded-full blur-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-500" />
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <QuoteIcon className="relative z-10 w-6 h-6 mb-2 text-white/80" />
              <p className="relative z-10 text-gray-300 group-hover:text-gray-200 italic text-sm mb-3">&quot;CineSynth lets us pump out engaging content in minutes instead of hours.&quot;</p>
              <span className="relative z-10 text-white font-semibold group-hover:text-cyan-200">— Samira L.</span>
              </div>
            </FadeInSection>
            <FadeInSection>
              <div className="relative p-6 bg-black/60 backdrop-blur-lg border border-gray-700 rounded-xl overflow-hidden group">
              <div className="absolute -top-5 -right-5 w-24 h-24 bg-cyan-500/40 rounded-full blur-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-500" />
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <QuoteIcon className="relative z-10 w-6 h-6 mb-2 text-white/80" />
              <p className="relative z-10 text-gray-300 group-hover:text-gray-200 italic text-sm mb-3">&quot;The results blew our minds. It&#39;s like having a full editing team on call.&quot;</p>
              <span className="relative z-10 text-white font-semibold group-hover:text-cyan-200">— Jordan K.</span>
              </div>
            </FadeInSection>
          </div>
        </section>
      </main>
      <footer className="p-4 text-center text-gray-500 text-sm">
        <p>&copy; {new Date().getFullYear()} CineSynth. AI that shatters the status quo.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
