"use client";

import {
  Globe,
  DeviceMobile,
  Buildings,
  UserFocus,
  PhoneCall,
  CurrencyCircleDollar,
} from "@/components/icons";

type Language = "en" | "id";

const copy = {
  en: {
    kicker: "Security education",
    title: "Warning signs worth knowing",
    subtitle:
      "Short primers. Not legal advice. If money or credentials are requested, pause and verify through a channel you already trust.",
    cards: [
      {
        title: "Phishing links",
        body: "A look-alike domain or shortened URL that asks you to log in or pay.",
        signs: "Misspelled brand names, unexpected attachments, login pages that do not match the official site.",
        action: "Type the official URL yourself. Do not tap the link in the message.",
        Icon: Globe,
      },
      {
        title: "Fake payment requests",
        body: "Urgent fees for delivery, taxes, or account recovery sent over chat.",
        signs: "Pay-now language, unusual payment apps, amounts that do not match any order you made.",
        action: "Check the merchant app or bank you already use. Never pay from a chat prompt.",
        Icon: CurrencyCircleDollar,
      },
      {
        title: "Bank / OTP impersonation",
        body: "Someone claiming to be your bank, marketplace, or telco asking for a one-time code.",
        signs: "They call first, demand OTP, or ask you not to hang up.",
        action: "Hang up. Call the number printed on your card or in the official app.",
        Icon: DeviceMobile,
      },
      {
        title: "Authority impersonation",
        body: "Police, prosecutors, or company executives pressuring you to transfer to a “safe account”.",
        signs: "Threats of arrest, secrecy, and a demand to keep the call open.",
        action: "End the call. Confirm with a known contact at the real institution.",
        Icon: Buildings,
      },
      {
        title: "Social engineering",
        body: "Emotional pressure, isolation, and a script that keeps you from thinking.",
        signs: "Time pressure, fear, shame, or a prize that requires an upfront fee.",
        action: "Slow down. Talk to someone you trust before sending anything.",
        Icon: UserFocus,
      },
      {
        title: "Voice / video call scams",
        body: "A familiar voice or face on a call asking for money or remote access.",
        signs: "Odd audio, delayed lip-sync, refusal to switch to a known channel.",
        action: "Hang up and call the person back on a number you already have.",
        Icon: PhoneCall,
      },
    ],
    signsLabel: "Watch for",
    actionLabel: "Do this",
  },
  id: {
    kicker: "Pendidikan keamanan",
    title: "Tanda bahaya yang perlu dikenal",
    subtitle:
      "Ringkasan singkat. Bukan nasihat hukum. Jika diminta uang atau kredensial, berhenti dan verifikasi lewat kanal yang sudah kamu percaya.",
    cards: [
      {
        title: "Tautan phishing",
        body: "Domain menyerupai merek atau URL pendek yang meminta login atau pembayaran.",
        signs: "Nama merek salah eja, lampiran tak terduga, halaman login yang tidak sama dengan situs resmi.",
        action: "Ketik URL resmi sendiri. Jangan ketuk tautan di pesan.",
        Icon: Globe,
      },
      {
        title: "Tagihan palsu",
        body: "Biaya mendesak untuk pengiriman, pajak, atau pemulihan akun lewat chat.",
        signs: "Bahasa bayar-sekarang, aplikasi bayar yang aneh, nominal yang tidak cocok dengan pesananmu.",
        action: "Cek di aplikasi merchant atau bank yang sudah kamu pakai. Jangan bayar dari chat.",
        Icon: CurrencyCircleDollar,
      },
      {
        title: "Peniruan bank / OTP",
        body: "Pihak yang mengaku bank, marketplace, atau operator meminta kode sekali pakai.",
        signs: "Mereka yang menelepon dulu, menuntut OTP, atau meminta jangan tutup telepon.",
        action: "Tutup telepon. Hubungi nomor di kartu atau di aplikasi resmi.",
        Icon: DeviceMobile,
      },
      {
        title: "Peniruan otoritas",
        body: "Polisi, jaksa, atau pimpinan perusahaan menekan agar transfer ke “rekening aman”.",
        signs: "Ancaman penahanan, kerahasiaan, dan permintaan agar panggilan tetap terbuka.",
        action: "Akhiri panggilan. Konfirmasi ke kontak yang sudah kamu kenal di institusi itu.",
        Icon: Buildings,
      },
      {
        title: "Rekayasa sosial",
        body: "Tekanan emosi, isolasi, dan skrip yang membuatmu tidak sempat berpikir.",
        signs: "Desakan waktu, rasa takut, malu, atau hadiah yang meminta biaya di muka.",
        action: "Pelan. Bicara dulu dengan orang yang kamu percaya sebelum mengirim apa pun.",
        Icon: UserFocus,
      },
      {
        title: "Scam panggilan suara / video",
        body: "Suara atau wajah familiar di panggilan yang meminta uang atau akses jarak jauh.",
        signs: "Audio aneh, bibir tidak sinkron, menolak pindah ke kanal yang sudah kamu kenal.",
        action: "Tutup, lalu telepon orang itu di nomor yang sudah kamu punya.",
        Icon: PhoneCall,
      },
    ],
    signsLabel: "Waspadai",
    actionLabel: "Lakukan ini",
  },
};

export default function SecurityEducation({ language }: { language: Language }) {
  const t = copy[language];

  return (
    <section id="education" className="scroll-mt-24 py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <header className="max-w-2xl mb-10 md:mb-14">
          <p className="text-xs font-mono uppercase tracking-[0.16em] text-blue-400 mb-3">
            {t.kicker}
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            {t.title}
          </h2>
          <p className="mt-3 text-slate-400 leading-relaxed">{t.subtitle}</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {t.cards.map((card) => {
            const Icon = card.Icon;
            return (
              <article
                key={card.title}
                className="card p-5 md:p-6 flex flex-col gap-3 hover:border-slate-700 transition-colors duration-200"
              >
                <div className="w-10 h-10 rounded-xl glass-accent grid place-items-center">
                  <Icon size={20} weight="duotone" className="text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{card.body}</p>
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.12em] text-amber-400/90 mb-1">
                    {t.signsLabel}
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed">{card.signs}</p>
                </div>
                <div className="mt-auto pt-1">
                  <p className="text-[11px] font-mono uppercase tracking-[0.12em] text-emerald-400/90 mb-1">
                    {t.actionLabel}
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed">{card.action}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
