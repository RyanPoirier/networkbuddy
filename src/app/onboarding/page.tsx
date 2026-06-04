'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { INDUSTRIES, YEARS } from '@/types'
import { Upload, X, ChevronRight, ChevronLeft } from 'lucide-react'

const STEPS = ['Basic Info', 'Target Companies', 'Resume (Optional)']

export default function OnboardingPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [school, setSchool] = useState('')
  const [program, setProgram] = useState('')
  const [year, setYear] = useState('')
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([])
  const [targetCompanies, setTargetCompanies] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeUploading, setResumeUploading] = useState(false)

  function toggleIndustry(industry: string) {
    setSelectedIndustries(prev =>
      prev.includes(industry) ? prev.filter(i => i !== industry) : [...prev, industry]
    )
  }

  async function handleResumeUpload(file: File) {
    setResumeUploading(true)
    setResumeFile(file)
    setResumeUploading(false)
  }

  async function handleSubmit() {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      let resumeSummary = null

      if (resumeFile) {
        const formData = new FormData()
        formData.append('file', resumeFile)
        const res = await fetch('/api/resume-parse', { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()
          resumeSummary = data.summary
        }
      }

      const companies = targetCompanies
        .split(',')
        .map(c => c.trim())
        .filter(Boolean)

      const { error } = await supabase.from('users').upsert({
        id: user.id,
        email: user.email!,
        name,
        school,
        program,
        year,
        target_industries: selectedIndustries,
        target_companies: companies,
        resume_summary: resumeSummary,
        onboarding_complete: true,
      })

      if (error) throw error

      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  const canProceedStep0 = name && school && program && year
  const canProceedStep1 = selectedIndustries.length > 0 && targetCompanies.trim().length > 0

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100">
        <span className="text-xl font-bold text-[#0f1f3d]">
          Network<span className="text-[#f97316]">Buddy</span>
        </span>
        <span className="text-sm text-slate-400">Step {step + 1} of {STEPS.length}</span>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {/* Progress bar */}
          <div className="flex gap-2 mb-8">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1">
                <div className={`h-1.5 rounded-full transition-colors ${i <= step ? 'bg-[#f97316]' : 'bg-slate-200'}`} />
                <span className={`text-xs mt-1 block ${i === step ? 'text-[#f97316] font-medium' : 'text-slate-400'}`}>{s}</span>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-6">{error}</div>
            )}

            {/* Step 0 — Basic Info */}
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-[#0f1f3d]">Tell us about yourself</h2>
                  <p className="text-slate-500 mt-1">This helps us personalize your outreach messages.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0f1f3d] mb-1.5">Full Name</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
                    placeholder="Alex Johnson"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0f1f3d] mb-1.5">School</label>
                  <input
                    value={school}
                    onChange={e => setSchool(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
                    placeholder="University of Toronto"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0f1f3d] mb-1.5">Program</label>
                  <input
                    value={program}
                    onChange={e => setProgram(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
                    placeholder="Computer Science"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0f1f3d] mb-1.5">Year</label>
                  <select
                    value={year}
                    onChange={e => setYear(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent bg-white"
                  >
                    <option value="">Select year</option>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Step 1 — Target Companies */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-[#0f1f3d]">Your targets</h2>
                  <p className="text-slate-500 mt-1">What industries and companies are you interested in?</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0f1f3d] mb-3">Target Industries</label>
                  <div className="flex flex-wrap gap-2">
                    {INDUSTRIES.map(industry => (
                      <button
                        key={industry}
                        type="button"
                        onClick={() => toggleIndustry(industry)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          selectedIndustries.includes(industry)
                            ? 'bg-[#f97316] text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {industry}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0f1f3d] mb-1.5">Target Companies</label>
                  <p className="text-xs text-slate-400 mb-2">Enter company names separated by commas</p>
                  <textarea
                    value={targetCompanies}
                    onChange={e => setTargetCompanies(e.target.value)}
                    rows={3}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent resize-none"
                    placeholder="Google, Shopify, McKinsey, RBC..."
                  />
                </div>
              </div>
            )}

            {/* Step 2 — Resume */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-[#0f1f3d]">Upload your resume</h2>
                  <p className="text-slate-500 mt-1">We&apos;ll extract your experience to personalize outreach. Totally optional.</p>
                </div>

                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#f97316] hover:bg-orange-50 transition-colors"
                >
                  {resumeFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                        <Upload className="w-5 h-5 text-[#f97316]" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-[#0f1f3d]">{resumeFile.name}</p>
                        <p className="text-sm text-slate-400">{(resumeFile.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setResumeFile(null) }}
                        className="ml-auto p-1 text-slate-400 hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-600">Click to upload your resume</p>
                      <p className="text-xs text-slate-400 mt-1">PDF, DOC, DOCX up to 5MB</p>
                    </div>
                  )}
                </div>

                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleResumeUpload(file)
                  }}
                />
                {resumeUploading && <p className="text-sm text-slate-500 text-center">Processing resume...</p>}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-8">
              {step > 0 ? (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-2 text-slate-500 hover:text-[#0f1f3d] font-medium transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              ) : <div />}

              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => setStep(s => s + 1)}
                  disabled={step === 0 ? !canProceedStep0 : !canProceedStep1}
                  className="flex items-center gap-2 bg-[#0f1f3d] hover:bg-[#1a3560] text-white font-semibold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-40"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 bg-[#f97316] hover:bg-[#ea6c0a] text-white font-semibold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  {loading ? 'Setting up...' : 'Finish setup'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
