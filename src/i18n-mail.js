// Customer-facing text the server writes (emails and automatic thread replies), per language.
// The language is the one the customer used on the site when they sent the request (leads.lang).
// Service names are translated with the site's own dictionaries (public/i18n-<lang>.js), so the
// email and the website always use the same wording.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const LANGS = ["en", "de", "fr", "es", "it", "ro", "he"];
const normLang = (l) => (LANGS.includes(String(l || "").toLowerCase()) ? String(l).toLowerCase() : "en");

// Language names for the AI prompts (in English) and for you in alerts and the admin panel.
const LANG_NAMES = { en: "English", de: "German", fr: "French", es: "Spanish", it: "Italian", ro: "Romanian", he: "Hebrew" };

const T = {
  en: {
    hi: (n) => `Hi ${n},`,
    ackSubject: "Thanks for your request - CloudHelm",
    ackIntro: (svc) => `Thanks for your request about "${svc}". Here is our first reply:`,
    ackPlain: (svc) => `Thanks for your request about "${svc}". We have it, and someone from the team will look at it shortly.`,
    haveReady: "To move faster, please have these ready:",
    callYes: "You asked for a free call, so we'll email you shortly to confirm a time.",
    callNo: "We'll follow up by email with any questions and the details of our offer.",
    track: 'You can track your request any time by signing in and opening "My Requests".',
    signoff: "The CloudHelm team",
    replySubject: (svc) => (svc ? `Re: your request - ${svc}` : "Re: your request"),
    replyFooter: 'You can reply to this email, or sign in and open "My Requests" to see the full conversation.',
    threadAsk: "To move faster, could you tell us:",
    team: [
      (n) => `Thanks ${n}! We've reviewed your request and we're happy to take it on. Our offer still stands - would you like to go ahead?`,
      () => "Great. Let's set up a quick call to finalise the details. We can do Google Meet or Discord, whichever you prefer - what day and time suit you this week?",
      () => "Perfect, noted. We'll send you a calendar invite with the call link shortly. Is there anything you'd like us to prepare beforehand?",
      (n) => `Thanks ${n}. A specialist will keep following up here and by email so nothing gets missed.`,
    ],
  },
  de: {
    hi: (n) => `Hallo ${n},`,
    ackSubject: "Danke für Ihre Anfrage - CloudHelm",
    ackIntro: (svc) => `Danke für Ihre Anfrage zu „${svc}“. Hier ist unsere erste Antwort:`,
    ackPlain: (svc) => `Danke für Ihre Anfrage zu „${svc}“. Sie ist bei uns angekommen und jemand aus dem Team sieht sie sich in Kürze an.`,
    haveReady: "Damit es schneller geht, halten Sie bitte Folgendes bereit:",
    callYes: "Sie wünschen ein kostenloses Gespräch. Wir schreiben Ihnen in Kürze, um einen Termin zu bestätigen.",
    callNo: "Wir melden uns per E-Mail mit eventuellen Fragen und den Details unseres Angebots.",
    track: "Sie können Ihre Anfrage jederzeit verfolgen: einfach anmelden und „Meine Anfragen“ öffnen.",
    signoff: "Ihr CloudHelm-Team",
    replySubject: (svc) => (svc ? `Re: Ihre Anfrage - ${svc}` : "Re: Ihre Anfrage"),
    replyFooter: "Sie können direkt auf diese E-Mail antworten oder sich anmelden und unter „Meine Anfragen“ die ganze Unterhaltung sehen.",
    threadAsk: "Damit es schneller geht, sagen Sie uns bitte:",
    team: [
      (n) => `Danke, ${n}! Wir haben Ihre Anfrage geprüft und übernehmen sie gern. Unser Angebot steht. Möchten Sie loslegen?`,
      () => "Prima. Lassen Sie uns ein kurzes Gespräch vereinbaren, um die Details zu klären. Google Meet oder Discord, ganz wie Sie möchten. Welcher Tag und welche Uhrzeit passen Ihnen diese Woche?",
      () => "Perfekt, notiert. Wir schicken Ihnen in Kürze eine Kalendereinladung mit dem Link zum Gespräch. Sollen wir vorher noch etwas vorbereiten?",
      (n) => `Danke, ${n}. Ein Spezialist bleibt hier und per E-Mail dran, damit nichts verloren geht.`,
    ],
  },
  fr: {
    hi: (n) => `Bonjour ${n},`,
    ackSubject: "Merci pour votre demande - CloudHelm",
    ackIntro: (svc) => `Merci pour votre demande concernant « ${svc} ». Voici notre première réponse :`,
    ackPlain: (svc) => `Merci pour votre demande concernant « ${svc} ». Nous l'avons bien reçue et quelqu'un de l'équipe va l'examiner rapidement.`,
    haveReady: "Pour avancer plus vite, merci de préparer :",
    callYes: "Vous avez demandé un appel gratuit : nous vous écrivons très vite pour confirmer un horaire.",
    callNo: "Nous reviendrons vers vous par e-mail avec nos éventuelles questions et le détail de notre offre.",
    track: "Vous pouvez suivre votre demande à tout moment en vous connectant et en ouvrant « Mes demandes ».",
    signoff: "L'équipe CloudHelm",
    replySubject: (svc) => (svc ? `Re : votre demande - ${svc}` : "Re : votre demande"),
    replyFooter: "Vous pouvez répondre directement à cet e-mail, ou vous connecter et ouvrir « Mes demandes » pour voir toute la conversation.",
    threadAsk: "Pour avancer plus vite, pourriez-vous nous dire :",
    team: [
      (n) => `Merci ${n} ! Nous avons étudié votre demande et nous sommes ravis de nous en occuper. Notre offre tient toujours. Souhaitez-vous lancer le projet ?`,
      () => "Parfait. Organisons un court appel pour finaliser les détails, sur Google Meet ou Discord selon votre préférence. Quel jour et quelle heure vous conviennent cette semaine ?",
      () => "C'est noté. Nous vous enverrons très vite une invitation avec le lien de l'appel. Souhaitez-vous que nous préparions quelque chose avant ?",
      (n) => `Merci ${n}. Un spécialiste continuera le suivi ici et par e-mail pour que rien ne soit oublié.`,
    ],
  },
  es: {
    hi: (n) => `Hola ${n}:`,
    ackSubject: "Gracias por tu solicitud - CloudHelm",
    ackIntro: (svc) => `Gracias por tu solicitud sobre «${svc}». Esta es nuestra primera respuesta:`,
    ackPlain: (svc) => `Gracias por tu solicitud sobre «${svc}». La hemos recibido y alguien del equipo la revisará en breve.`,
    haveReady: "Para ir más rápido, ten a mano:",
    callYes: "Has pedido una llamada gratuita: te escribiremos en breve para confirmar la hora.",
    callNo: "Te escribiremos por correo con las preguntas que tengamos y los detalles de nuestra propuesta.",
    track: "Puedes seguir tu solicitud cuando quieras iniciando sesión y abriendo «Mis solicitudes».",
    signoff: "El equipo de CloudHelm",
    replySubject: (svc) => (svc ? `Re: tu solicitud - ${svc}` : "Re: tu solicitud"),
    replyFooter: "Puedes responder a este correo, o iniciar sesión y abrir «Mis solicitudes» para ver toda la conversación.",
    threadAsk: "Para ir más rápido, ¿podrías contarnos?:",
    team: [
      (n) => `¡Gracias, ${n}! Hemos revisado tu solicitud y estaremos encantados de encargarnos. Nuestra propuesta sigue en pie. ¿Quieres que empecemos?`,
      () => "Genial. Hagamos una llamada corta para cerrar los detalles, por Google Meet o Discord, como prefieras. ¿Qué día y hora te vienen bien esta semana?",
      () => "Perfecto, apuntado. En breve te enviaremos una invitación con el enlace de la llamada. ¿Quieres que preparemos algo antes?",
      (n) => `Gracias, ${n}. Un especialista seguirá en contacto por aquí y por correo para que no se nos escape nada.`,
    ],
  },
  it: {
    hi: (n) => `Ciao ${n},`,
    ackSubject: "Grazie per la tua richiesta - CloudHelm",
    ackIntro: (svc) => `Grazie per la tua richiesta su «${svc}». Ecco la nostra prima risposta:`,
    ackPlain: (svc) => `Grazie per la tua richiesta su «${svc}». L'abbiamo ricevuta e qualcuno del team la esaminerà a breve.`,
    haveReady: "Per andare più veloci, tieni pronto:",
    callYes: "Hai chiesto una chiamata gratuita: ti scriveremo a breve per confermare l'orario.",
    callNo: "Ti scriveremo via email con eventuali domande e i dettagli della nostra offerta.",
    track: "Puoi seguire la tua richiesta in qualsiasi momento accedendo e aprendo «Le mie richieste».",
    signoff: "Il team di CloudHelm",
    replySubject: (svc) => (svc ? `Re: la tua richiesta - ${svc}` : "Re: la tua richiesta"),
    replyFooter: "Puoi rispondere direttamente a questa email, oppure accedere e aprire «Le mie richieste» per vedere tutta la conversazione.",
    threadAsk: "Per andare più veloci, potresti dirci:",
    team: [
      (n) => `Grazie ${n}! Abbiamo esaminato la tua richiesta e ce ne occupiamo volentieri. La nostra offerta è sempre valida. Vuoi procedere?`,
      () => "Ottimo. Fissiamo una breve chiamata per definire i dettagli, su Google Meet o Discord, come preferisci. Quale giorno e orario ti vanno bene questa settimana?",
      () => "Perfetto, preso nota. A breve ti mandiamo un invito con il link della chiamata. C'è qualcosa che vuoi farci preparare prima?",
      (n) => `Grazie ${n}. Uno specialista continuerà a seguirti qui e via email, così non ci sfugge niente.`,
    ],
  },
  ro: {
    hi: (n) => `Salut ${n},`,
    ackSubject: "Mulțumim pentru cerere - CloudHelm",
    ackIntro: (svc) => `Mulțumim pentru cererea ta privind „${svc}”. Iată primul nostru răspuns:`,
    ackPlain: (svc) => `Mulțumim pentru cererea ta privind „${svc}”. Am primit-o și cineva din echipă se va uita la ea în curând.`,
    haveReady: "Ca să mergem mai repede, te rugăm să ai pregătite:",
    callYes: "Ai cerut un apel gratuit, așa că îți scriem în curând ca să confirmăm ora.",
    callNo: "Revenim pe email cu eventualele întrebări și detaliile ofertei noastre.",
    track: "Poți urmări cererea oricând: te autentifici și deschizi „Cererile mele”.",
    signoff: "Echipa CloudHelm",
    replySubject: (svc) => (svc ? `Re: cererea ta - ${svc}` : "Re: cererea ta"),
    replyFooter: "Poți răspunde direct la acest email sau te poți autentifica și deschide „Cererile mele” ca să vezi toată conversația.",
    threadAsk: "Ca să mergem mai repede, ne poți spune:",
    team: [
      (n) => `Mulțumim, ${n}! Am analizat cererea ta și ne ocupăm cu plăcere de ea. Oferta noastră rămâne valabilă. Vrei să începem?`,
      () => "Super. Hai să stabilim un apel scurt ca să finalizăm detaliile, pe Google Meet sau Discord, cum preferi. Ce zi și ce oră îți convin săptămâna aceasta?",
      () => "Perfect, am notat. Îți trimitem în curând o invitație în calendar cu linkul apelului. Vrei să pregătim ceva înainte?",
      (n) => `Mulțumim, ${n}. Un specialist va continua să țină legătura aici și pe email, ca nimic să nu se piardă.`,
    ],
  },
  he: {
    hi: (n) => `שלום ${n},`,
    ackSubject: "תודה על הבקשה - CloudHelm",
    ackIntro: (svc) => `תודה על הבקשה בנושא "${svc}". הנה התשובה הראשונה שלנו:`,
    ackPlain: (svc) => `תודה על הבקשה בנושא "${svc}". קיבלנו אותה ומישהו מהצוות יעבור עליה בקרוב.`,
    haveReady: "כדי להתקדם מהר יותר, אנא הכינו את הדברים הבאים:",
    callYes: "ביקשתם שיחה חינם, אז נכתוב לכם בקרוב כדי לתאם מועד.",
    callNo: "נחזור אליכם בדוא\"ל עם שאלות, אם יהיו, ועם פרטי ההצעה שלנו.",
    track: "אפשר לעקוב אחרי הבקשה בכל עת: מתחברים ופותחים את 'הבקשות שלי'.",
    signoff: "צוות CloudHelm",
    replySubject: (svc) => (svc ? `תשובה לבקשה שלכם - ${svc}` : "תשובה לבקשה שלכם"),
    replyFooter: "אפשר להשיב ישירות למייל הזה, או להתחבר ולפתוח את 'הבקשות שלי' כדי לראות את כל השיחה.",
    threadAsk: "כדי להתקדם מהר יותר, תוכלו לספר לנו:",
    team: [
      (n) => `תודה ${n}! עברנו על הבקשה שלכם ונשמח לקחת אותה. ההצעה שלנו עדיין בתוקף. רוצים שנתחיל?`,
      () => "מעולה. בואו נקבע שיחה קצרה כדי לסגור את הפרטים, ב-Google Meet או בדיסקורד, מה שנוח לכם. איזה יום ושעה מתאימים לכם השבוע?",
      () => "מצוין, רשמנו. נשלח לכם בקרוב הזמנה ליומן עם הקישור לשיחה. יש משהו שתרצו שנכין מראש?",
      (n) => `תודה ${n}. מומחה ימשיך לעקוב כאן ובדוא"ל כדי ששום דבר לא יתפספס.`,
    ],
  },
};

// Site dictionaries, loaded once per language from the public folder.
const siteDicts = {};
function siteDict(lang) {
  if (lang === "en") return {};
  if (!siteDicts[lang]) {
    try {
      const sandbox = { window: {} };
      vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "public", `i18n-${lang}.js`), "utf8"), sandbox);
      siteDicts[lang] = (sandbox.window.I18N_DICTS || {})[lang] || {};
    } catch (e) {
      console.error(`[i18n] could not load site dictionary for ${lang}:`, e.message);
      siteDicts[lang] = {};
    }
  }
  return siteDicts[lang];
}

function mailText(lang) { return T[normLang(lang)]; }
function serviceName(name, lang) { return siteDict(normLang(lang))[name] || name; }

module.exports = { LANGS, LANG_NAMES, normLang, mailText, serviceName };
