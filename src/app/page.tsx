import Link from "next/link"
import { Users, MessageSquare, TrendingUp, ArrowRight } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="text-2xl font-bold text-[#0f1f3d]">
          Network<span className="text-[#f97316]">Buddy</span>
        </span>
        <div className="flex items-center gap-4">
          <Link href="/auth/login" className="text-[#0f1f3d] hover:text-[#f97316] font-medium transition-colors">
            Log in
          </Link>
          <Link href="/auth/signup" className="bg-[#f97316] hover:bg-[#ea6c0a] text-white font-semibold px-5 py-2 rounded-lg transition-colors">
            Get started
          </Link>
        </div>
      </nav>

      <section className="max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-orange-50 text-[#f97316] text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          Built for university students
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold text-[#0f1f3d] leading-tight mb-6">
          Land referrals at your<br />
          <span className="text-[#f97316]">dream companies</span>
        </h1>
        <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-10">
          NetworkBuddy finds real contacts at your target companies, generates personalized outreach messages, and helps you track every conversation — all in one place.
        </p>
        <Link href="/auth/signup" className="inline-flex items-center gap-2 bg-[#0f1f3d] hover:bg-[#1a3560] text-white font-semibold px-8 py-3.5 rounded-xl text-lg transition-colors">
          Start for free <ArrowRight className="w-5 h-5" />
        </Link>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-[#0f1f3d] mb-14">Everything you need to network smarter</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Users className="w-7 h-7 text-[#f97316]" />,
                title: "Find Contacts",
                desc: "Search any company and instantly find verified email addresses and LinkedIn profiles of people who can refer you.",
              },
              {
                icon: <MessageSquare className="w-7 h-7 text-[#f97316]" />,
                title: "Personalized Outreach",
                desc: "AI generates a tailored email and LinkedIn message for every contact, based on your background and their role.",
              },
              {
                icon: <TrendingUp className="w-7 h-7 text-[#f97316]" />,
                title: "Track Your Pipeline",
                desc: "Kanban board to move contacts from Saved to Referral Received. Never let a follow-up slip through the cracks.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
                <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center mb-5">{f.icon}</div>
                <h3 className="text-xl font-bold text-[#0f1f3d] mb-2">{f.title}</h3>
                <p className="text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0f1f3d] py-20 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">Ready to land your next referral?</h2>
        <p className="text-slate-400 mb-8 text-lg">Free to use. No credit card required.</p>
        <Link href="/auth/signup" className="inline-flex items-center gap-2 bg-[#f97316] hover:bg-[#ea6c0a] text-white font-semibold px-8 py-3.5 rounded-xl text-lg transition-colors">
          Create your account <ArrowRight className="w-5 h-5" />
        </Link>
      </section>

      <footer className="py-8 text-center text-slate-400 text-sm">
        © {new Date().getFullYear()} NetworkBuddy
      </footer>
    </div>
  )
}
