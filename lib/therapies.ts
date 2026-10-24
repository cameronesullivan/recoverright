/**
 * Curated list of alternative and emerging therapies.
 *
 * The AI may only pick items from this list (by id). Everything shown to the
 * user about a therapy's evidence, risks, cost, and regulatory status comes
 * from this file, not from the AI, so the claims stay consistent and reviewable.
 *
 * Content rules for anyone editing this file:
 * - Plain language, honest about uncertainty.
 * - No study names, authors, journals, or statistics from specific papers.
 * - No dosing for substances that are not FDA-approved.
 * - Have a licensed clinician review changes before publishing.
 *
 * Costs are rough U.S. estimates and vary widely by location and provider.
 */

export type EvidenceLevel = "strong" | "emerging" | "experimental";

export const EVIDENCE_LABELS: Record<EvidenceLevel, string> = {
  strong: "Strong evidence",
  emerging: "Emerging / mixed evidence",
  experimental: "Experimental / mostly anecdotal",
};

export const EVIDENCE_DESCRIPTIONS: Record<EvidenceLevel, string> = {
  strong:
    "Consistent results from good-quality human studies, and often recommended in clinical guidelines for this use.",
  emerging:
    "Some promising human studies, but results are mixed, small, or limited to certain injuries.",
  experimental:
    "Mostly lab, animal, or personal-story evidence. Safety and benefit in people are not established.",
};

export type InjuryTag =
  | "fracture"
  | "ligament"
  | "tendon"
  | "muscle"
  | "joint"
  | "post-surgery"
  | "knee"
  | "upper-limb"
  | "any";

export interface AlternativeTherapy {
  id: string;
  name: string;
  alsoKnownAs: readonly string[];
  category: string;
  evidenceLevel: EvidenceLevel;
  /** What the research shows, in plain language. */
  evidenceSummary: string;
  risks: readonly string[];
  costRange: string;
  regulatoryStatus: string;
  /** Extra note for competitive athletes (anti-doping rules), if relevant. */
  athleteNote: string | null;
  /** True when the product is not FDA-approved for this use. No dosing is ever shown. */
  unapproved: boolean;
  relevantFor: readonly InjuryTag[];
}

export const THERAPIES = [
  {
    id: "nmes",
    name: "Neuromuscular electrical stimulation (NMES)",
    alsoKnownAs: ["E-stim", "Russian stimulation"],
    category: "Device used in physical therapy",
    evidenceLevel: "strong",
    evidenceSummary:
      "NMES uses mild electrical pulses through pads on the skin to make a muscle contract. After knee surgery such as ACL reconstruction, research consistently shows that adding NMES to exercise helps restore thigh (quadriceps) strength, and ACL rehab guidelines recommend it. The evidence for other injuries is less consistent. This rating applies to strength recovery after knee surgery.",
    risks: [
      "Skin irritation under the pads",
      "Discomfort during strong contractions",
      "Not for people with pacemakers or implanted defibrillators unless their cardiologist approves",
      "Should not be placed over the chest, front of the neck, broken skin, or a suspected blood clot",
    ],
    costRange:
      "Often included in PT visits. Home units cost about $50–$500; prescription units can cost more.",
    regulatoryStatus:
      "NMES devices are FDA-cleared medical devices. Some are prescription-only.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["knee", "ligament", "post-surgery", "muscle"],
  },
  {
    id: "bfr-training",
    name: "Blood flow restriction (BFR) training",
    alsoKnownAs: ["Occlusion training", "Kaatsu"],
    category: "Exercise technique (clinician-supervised)",
    evidenceLevel: "emerging",
    evidenceSummary:
      "BFR uses a special cuff on the upper arm or thigh to partly limit blood flow while you exercise with very light weights. A growing body of research, including in people recovering from knee injuries and ACL surgery, suggests it can build or maintain muscle size and strength while putting less load on healing tissue. Studies are still fairly small and methods vary.",
    risks: [
      "Should be set up and supervised by a trained clinician",
      "Rare risks include blood clots, nerve irritation, bruising, and fainting",
      "Not suitable for people with a history of blood clots, poor circulation, uncontrolled high blood pressure, or certain heart conditions",
    ],
    costRange:
      "Often part of PT sessions. Clinical cuff systems with pressure control cost about $500–$5,000. Cheap elastic gym bands do not control pressure and are not a substitute.",
    regulatoryStatus:
      "Clinical BFR systems with pressure control are sold as medical devices. Elastic 'occlusion bands' sold for gyms are not regulated for medical use.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["knee", "ligament", "muscle", "tendon", "fracture", "upper-limb", "post-surgery"],
  },
  {
    id: "cross-education",
    name: "Cross-education (training the uninjured side)",
    alsoKnownAs: ["Contralateral training"],
    category: "Exercise technique",
    evidenceLevel: "emerging",
    evidenceSummary:
      "Strength training your uninjured arm or leg can reduce strength loss in the injured, immobilized limb through effects on the nervous system. Several studies, including in people with wrist fractures and after knee surgery, support this, but the effect is modest.",
    risks: [
      "Very low risk",
      "Follow any movement or weight-bearing restrictions your care team has given you",
    ],
    costRange: "Free; can be done at home or the gym.",
    regulatoryStatus: "Not regulated; it is a form of exercise.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["fracture", "upper-limb", "knee", "ligament", "post-surgery", "muscle"],
  },
  {
    id: "red-light-therapy",
    name: "Red light / low-level laser therapy",
    alsoKnownAs: ["Photobiomodulation", "LLLT", "Cold laser"],
    category: "Light-based device",
    evidenceLevel: "emerging",
    evidenceSummary:
      "Lab and animal studies suggest red and near-infrared light may affect how cells use energy and manage inflammation. Human studies are small and inconsistent. Some show modest short-term pain relief for tendon and joint problems, but evidence that it speeds healing of bones, ligaments, or tendons is limited. Results depend heavily on the device, wavelength, and dose, and most consumer devices have not been tested in trials.",
    risks: [
      "Eye injury from lasers or very bright LEDs; use the eye protection provided",
      "Skin burns with overuse or heat, especially over areas with reduced feeling",
      "Avoid use over known or suspected cancer",
      "Can interact with medicines that make skin sensitive to light",
    ],
    costRange:
      "Clinic sessions about $25–$100 each. Home devices about $100–$1,500 or more.",
    regulatoryStatus:
      "Many devices are FDA-cleared (not FDA-approved) as low-risk devices for uses such as temporary relief of minor muscle and joint pain. Clearance does not mean the device has been shown to speed injury healing.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["tendon", "ligament", "muscle", "joint", "fracture", "any"],
  },
  {
    id: "hyperbaric-oxygen",
    name: "Hyperbaric oxygen therapy (HBOT)",
    alsoKnownAs: ["Oxygen chamber"],
    category: "Pressurized oxygen treatment",
    evidenceLevel: "emerging",
    evidenceSummary:
      "HBOT has well-established uses for a short list of conditions, such as decompression sickness, carbon monoxide poisoning, some hard-to-heal wounds, and certain severe crush injuries. For common sports injuries, typical fractures, and ligament or tendon tears, the research is limited and mixed, and there is no clear proof that it speeds return to normal activity.",
    risks: [
      "Ear and sinus pain or injury from pressure changes",
      "Temporary changes in vision",
      "Rare seizures from oxygen toxicity",
      "Lung problems in people with certain lung conditions",
      "Fire risk because of high oxygen levels",
      "Claustrophobia",
    ],
    costRange:
      "About $100–$400 or more per session. Courses often run 20–40 sessions. Insurance usually covers only approved uses.",
    regulatoryStatus:
      "Hyperbaric chambers are FDA-cleared for a specific list of conditions, and most sports injuries are not on it. FDA has warned consumers that HBOT is marketed for many uses that have not been shown to be safe and effective. Soft-sided 'mild' chambers are cleared only for altitude sickness.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["fracture", "ligament", "tendon", "muscle", "post-surgery", "any"],
  },
  {
    id: "prp",
    name: "Platelet-rich plasma (PRP) injections",
    alsoKnownAs: ["PRP"],
    category: "Injection made from your own blood",
    evidenceLevel: "emerging",
    evidenceSummary:
      "PRP concentrates part of your own blood and injects it into the injured area. Results depend on the injury. They are more encouraging for some long-lasting tendon problems (such as tennis elbow) and knee arthritis, and less clear for fresh muscle injuries, ligament tears, fractures, and as an add-on to surgery. Clinics prepare PRP in very different ways, which makes results hard to compare.",
    risks: [
      "Pain or a flare-up for several days after the injection",
      "Infection (rare)",
      "Nerve or tissue irritation at the injection site",
      "You may be asked to avoid anti-inflammatory medicines around the injection",
    ],
    costRange: "About $500–$2,500 per injection. Usually not covered by insurance.",
    regulatoryStatus:
      "The systems used to prepare PRP are FDA-cleared devices. Injecting PRP for injuries is generally off-label, which doctors may legally do, but the FDA has not reviewed it as a treatment for these uses.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["tendon", "ligament", "muscle", "joint", "post-surgery"],
  },
  {
    id: "bone-stimulators",
    name: "Bone growth stimulators (ultrasound or electromagnetic)",
    alsoKnownAs: ["LIPUS", "PEMF bone stimulator"],
    category: "Prescription medical device",
    evidenceLevel: "emerging",
    evidenceSummary:
      "These devices send low-intensity ultrasound or electromagnetic signals through the skin to a broken bone. The evidence is strongest for fractures that are not healing on schedule (delayed union or nonunion). For fresh fractures that are healing normally, larger studies have not shown a clear improvement in function or return to activity.",
    risks: [
      "Very low physical risk",
      "The main downsides are cost and daily treatment time",
    ],
    costRange:
      "About $1,000–$5,000 or more for the device. Insurance may cover it for nonunions with prior approval.",
    regulatoryStatus:
      "Several devices are FDA-approved, by prescription, mainly for fractures that have not healed and for some other specific uses.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["fracture", "post-surgery"],
  },
  {
    id: "eswt",
    name: "Extracorporeal shockwave therapy (ESWT)",
    alsoKnownAs: ["Shockwave therapy"],
    category: "Device-based treatment",
    evidenceLevel: "emerging",
    evidenceSummary:
      "ESWT sends strong sound waves into tissue. Its best support is for some long-lasting tendon and soft-tissue problems, such as chronic plantar fasciitis and calcium deposits in shoulder tendons. Evidence for fresh injuries, ligament tears, and normal fracture healing is limited. It is sometimes used for fractures that are not healing.",
    risks: [
      "Pain during treatment",
      "Bruising, redness, or temporary numbness",
      "Not used over growth plates, open wounds, or blood clots",
    ],
    costRange:
      "About $100–$500 per session, usually 3–6 sessions. Often not covered by insurance.",
    regulatoryStatus:
      "Some ESWT devices are FDA-approved for specific conditions, such as chronic plantar fasciitis and tennis elbow. Many other uses are off-label.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["tendon", "fracture"],
  },
  {
    id: "vitamin-c-wrist",
    name: "Vitamin C after a wrist fracture",
    alsoKnownAs: ["Ascorbic acid"],
    category: "Dietary supplement",
    evidenceLevel: "emerging",
    evidenceSummary:
      "Complex regional pain syndrome (CRPS) is an uncommon but serious pain condition that can follow a broken wrist. Some trials found that taking vitamin C in the weeks after a wrist fracture lowered the rate of CRPS, while others did not, so expert guidelines disagree on whether to recommend it. Ask your doctor whether it makes sense for you.",
    risks: [
      "Usually well tolerated",
      "High amounts can cause stomach upset and may raise kidney stone risk in some people",
      "Check with your doctor first if you have kidney disease",
    ],
    costRange: "About $5–$20 per month.",
    regulatoryStatus:
      "Sold as a dietary supplement. Supplements are not FDA-approved, and quality varies between brands.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["fracture", "upper-limb"],
  },
  {
    id: "collagen-vitamin-c",
    name: "Collagen or gelatin with vitamin C before exercise",
    alsoKnownAs: ["Collagen peptides"],
    category: "Dietary supplement",
    evidenceLevel: "emerging",
    evidenceSummary:
      "Small studies suggest that taking gelatin or collagen with vitamin C before rehab exercise may increase markers of collagen production. Whether this actually makes tendons or ligaments heal faster in people has not been shown in large trials.",
    risks: [
      "Generally well tolerated",
      "Some products come from fish or shellfish, which matters for allergies",
      "Supplement quality varies; look for third-party testing",
    ],
    costRange: "About $15–$50 per month.",
    regulatoryStatus:
      "Sold as a dietary supplement. Supplements are not FDA-approved.",
    athleteNote:
      "Choose products with third-party sport certification to lower the risk of contamination with banned substances.",
    unapproved: false,
    relevantFor: ["tendon", "ligament", "post-surgery"],
  },
  {
    id: "creatine",
    name: "Creatine monohydrate",
    alsoKnownAs: ["Creatine"],
    category: "Dietary supplement",
    evidenceLevel: "emerging",
    evidenceSummary:
      "Creatine is one of the most studied supplements for strength training in healthy people. During immobilization and rehab, results are mixed: some studies show less muscle loss or faster strength recovery, and others show no benefit.",
    risks: [
      "Water weight gain and stomach upset",
      "People with kidney disease should avoid it unless their doctor approves",
      "Supplement quality varies; look for third-party testing",
    ],
    costRange: "About $10–$30 per month.",
    regulatoryStatus:
      "Sold as a dietary supplement. Supplements are not FDA-approved.",
    athleteNote:
      "Creatine is permitted in sport, but supplements can be contaminated, so choose third-party sport-certified products.",
    unapproved: false,
    relevantFor: ["muscle", "post-surgery", "ligament", "fracture", "any"],
  },
  {
    id: "anti-inflammatory-supplements",
    name: "Omega-3 (fish oil) and curcumin (turmeric)",
    alsoKnownAs: ["Fish oil", "Turmeric"],
    category: "Dietary supplement",
    evidenceLevel: "emerging",
    evidenceSummary:
      "These supplements have modest evidence for easing joint pain in arthritis. There is little evidence that they speed healing of a new injury. Some researchers have raised the possibility that strongly reducing inflammation early on could interfere with normal healing, though this is not proven.",
    risks: [
      "Both may increase bleeding risk, which matters before surgery and with blood thinners",
      "Curcumin has been linked to rare cases of liver injury",
      "Stomach upset",
    ],
    costRange: "About $10–$40 per month.",
    regulatoryStatus:
      "Sold as dietary supplements. Supplements are not FDA-approved.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["joint", "any"],
  },
  {
    id: "acupuncture",
    name: "Acupuncture",
    alsoKnownAs: [],
    category: "Needle-based therapy",
    evidenceLevel: "emerging",
    evidenceSummary:
      "Acupuncture has modest evidence for short-term relief of some long-lasting pain conditions, such as knee arthritis and low back pain. Studies often find only small differences compared with sham (fake) acupuncture. There is no good evidence that it speeds healing of fractures or tears.",
    risks: [
      "Minor bruising or soreness",
      "Rare infection or lung puncture if done incorrectly",
      "Use a licensed practitioner who uses sterile, single-use needles",
    ],
    costRange: "About $60–$150 per session. Some insurance plans cover it.",
    regulatoryStatus:
      "Acupuncture needles are FDA-regulated medical devices. Practitioners are licensed by individual states.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["any", "joint"],
  },
  {
    id: "massage",
    name: "Massage and soft-tissue work",
    alsoKnownAs: ["Scar massage", "Myofascial release"],
    category: "Hands-on therapy",
    evidenceLevel: "emerging",
    evidenceSummary:
      "Massage can ease pain and muscle tension in the short term, and once a wound is fully closed it may help with stiffness and scar mobility. It has not been shown to speed healing of the injured tissue itself.",
    risks: [
      "Avoid direct pressure over a fresh fracture, an unhealed incision, or a suspected blood clot",
      "Bruising or soreness",
    ],
    costRange: "About $60–$150 per session. Self-massage tools about $20–$200.",
    regulatoryStatus:
      "Massage therapists are licensed in most U.S. states. Not FDA-regulated.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["any", "post-surgery", "muscle"],
  },
  {
    id: "tens",
    name: "TENS for pain relief",
    alsoKnownAs: ["Transcutaneous electrical nerve stimulation"],
    category: "Device-based pain relief",
    evidenceLevel: "emerging",
    evidenceSummary:
      "TENS uses mild electrical pulses to dampen pain signals. Some studies show short-term pain relief, including after surgery, but results vary. It does not affect how the tissue heals.",
    risks: [
      "Skin irritation under the pads",
      "Avoid with pacemakers or implanted defibrillators unless a cardiologist approves",
      "Do not place over the chest, front of the neck, eyes, or broken skin",
      "Ask your doctor before using during pregnancy",
    ],
    costRange: "About $30–$100 for an over-the-counter unit.",
    regulatoryStatus:
      "TENS units are FDA-cleared devices, and many are sold over the counter.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["any", "post-surgery"],
  },
  {
    id: "kinesiology-tape",
    name: "Kinesiology tape",
    alsoKnownAs: ["K-tape", "KT tape"],
    category: "Taping",
    evidenceLevel: "emerging",
    evidenceSummary:
      "Studies mostly find small or no benefit compared with sham taping or standard care, though some people say they feel more supported or aware of the joint. It does not stabilize a joint the way a brace does.",
    risks: [
      "Skin irritation or blisters",
      "A false sense of stability can lead to doing too much too soon",
    ],
    costRange: "About $10–$25 per roll.",
    regulatoryStatus: "Treated as a low-risk product with minimal regulation.",
    athleteNote: null,
    unapproved: false,
    relevantFor: ["ligament", "tendon", "knee", "joint", "any"],
  },
  {
    id: "whole-body-cryotherapy",
    name: "Whole-body cryotherapy chambers",
    alsoKnownAs: ["Cryo chamber"],
    category: "Cold exposure",
    evidenceLevel: "experimental",
    evidenceSummary:
      "Standing in a chamber of extremely cold air for a few minutes is popular for 'recovery', but the evidence for injury healing is weak. Studies are small and mostly look at muscle soreness after exercise in healthy people. This is different from ordinary ice packs, which are commonly used for short-term pain and swelling.",
    risks: [
      "Frostbite, cold burns, and dangerously low body temperature",
      "Not for people with heart conditions, high blood pressure, Raynaud's, or cold sensitivity",
    ],
    costRange: "About $40–$100 per session.",
    regulatoryStatus:
      "FDA has not cleared or approved any whole-body cryotherapy device to treat medical conditions and has warned consumers about its risks.",
    athleteNote: null,
    unapproved: true,
    relevantFor: ["muscle", "any"],
  },
  {
    id: "cbd-topical",
    name: "CBD creams and oils",
    alsoKnownAs: ["Cannabidiol"],
    category: "Cannabis-derived product",
    evidenceLevel: "experimental",
    evidenceSummary:
      "Many people use CBD products for pain, but there are very few well-controlled studies for injury pain. Testing has found that many products contain more or less CBD than the label says.",
    risks: [
      "Skin irritation with creams",
      "Some products contain THC, which can cause a positive drug test",
      "CBD taken by mouth can interact with other medicines and affect the liver",
    ],
    costRange: "About $20–$80 per product.",
    regulatoryStatus:
      "FDA has approved only one CBD medicine, for certain seizure disorders. CBD creams and oils sold for pain are not FDA-approved or reviewed for safety, and laws vary by state.",
    athleteNote:
      "CBD itself is permitted in sport, but THC is banned in competition, and many CBD products contain THC.",
    unapproved: true,
    relevantFor: ["any"],
  },
  {
    id: "stem-cell-injections",
    name: "'Stem cell' and other cell-based injections",
    alsoKnownAs: ["Regenerative injections", "Bone marrow aspirate", "Exosomes"],
    category: "Injection (often sold by private clinics)",
    evidenceLevel: "experimental",
    evidenceSummary:
      "Clinics advertise injections made from bone marrow, fat, or birth tissue to 'regenerate' injured tissue. High-quality evidence that these injections repair ligaments, tendons, cartilage, or bone is lacking, and many products sold as 'stem cells' contain few or no living stem cells.",
    risks: [
      "Infection",
      "Serious harms have been reported from unapproved products, including blindness and tumors in rare cases",
      "High cost with no proven benefit",
    ],
    costRange: "About $3,000–$10,000 or more per treatment. Not covered by insurance.",
    regulatoryStatus:
      "FDA has not approved any stem cell or exosome product for orthopedic or sports injuries and has warned consumers about clinics selling unapproved treatments.",
    athleteNote: null,
    unapproved: true,
    relevantFor: ["ligament", "tendon", "joint", "fracture", "knee"],
  },
  {
    id: "ozone-injections",
    name: "Ozone injections",
    alsoKnownAs: ["Ozone therapy", "Prolozone"],
    category: "Injection",
    evidenceLevel: "experimental",
    evidenceSummary:
      "Some clinics inject ozone gas into joints or soft tissue. A few small, low-quality studies exist for knee arthritis and back pain, and there is no good evidence that it helps new injuries heal.",
    risks: [
      "Infection and joint irritation",
      "Rare but serious gas embolism (a gas bubble in a blood vessel)",
    ],
    costRange: "About $100–$500 per session.",
    regulatoryStatus:
      "Not FDA-approved for any medical use. FDA regulations describe ozone as a toxic gas with no known useful medical application.",
    athleteNote: null,
    unapproved: true,
    relevantFor: ["joint", "any"],
  },
  {
    id: "bpc-157",
    name: "BPC-157 (peptide)",
    alsoKnownAs: ["Body Protection Compound-157"],
    category: "Unapproved peptide",
    evidenceLevel: "experimental",
    evidenceSummary:
      "BPC-157 is a lab-made peptide based on a protein found in stomach juice. Most research is in rats and cell cultures, where it has shown effects on tendon, ligament, muscle, and gut healing. There are almost no well-controlled human studies, so it is not known whether it works or is safe in people. Much of the enthusiasm online comes from personal stories.",
    risks: [
      "Long-term safety in humans is unknown",
      "Products sold online are often labeled 'for research use only' and may be contaminated, mislabeled, or a different strength than stated",
      "Injection risks such as infection",
      "Because it may promote new blood vessel growth in animal studies, researchers have raised theoretical concerns for people with a history of cancer",
    ],
    costRange: "Typically about $50–$200 or more per month from unregulated sellers.",
    regulatoryStatus:
      "Not FDA-approved for any use. FDA has listed BPC-157 among substances that may pose significant safety risks in compounded drugs, so it is not legally sold as a medicine in the U.S. Check FDA's current guidance, because this status can change.",
    athleteNote:
      "Banned at all times by the World Anti-Doping Agency (WADA).",
    unapproved: true,
    relevantFor: ["tendon", "ligament", "muscle", "any"],
  },
  {
    id: "tb-500",
    name: "TB-500 / thymosin beta-4 (peptide)",
    alsoKnownAs: ["Thymosin beta-4 fragment"],
    category: "Unapproved peptide",
    evidenceLevel: "experimental",
    evidenceSummary:
      "TB-500 is a synthetic version of part of thymosin beta-4, a protein involved in cell movement and repair. Animal and lab studies suggest effects on wound and tissue repair, but there are no reliable human studies showing it helps sports or orthopedic injuries.",
    risks: [
      "Safety in humans is unknown",
      "Products from unregulated sellers may be contaminated or mislabeled",
      "Injection risks such as infection",
    ],
    costRange: "Typically about $100–$300 or more per month from unregulated sellers.",
    regulatoryStatus:
      "Not FDA-approved for any use. FDA has raised safety concerns about thymosin beta-4 fragments in compounded drugs. Check FDA's current guidance, because this status can change.",
    athleteNote: "Banned at all times by the World Anti-Doping Agency (WADA).",
    unapproved: true,
    relevantFor: ["tendon", "ligament", "muscle", "any"],
  },
  {
    id: "gh-peptides",
    name: "Growth hormone–releasing peptides",
    alsoKnownAs: ["Ipamorelin", "CJC-1295", "Sermorelin"],
    category: "Unapproved peptide",
    evidenceLevel: "experimental",
    evidenceSummary:
      "These peptides are marketed to raise growth hormone levels and speed recovery. There is no good evidence that they help injuries heal in people.",
    risks: [
      "Water retention, joint pain, and raised blood sugar",
      "Long-term risks are unknown",
      "Products from unregulated sellers may be contaminated or mislabeled",
    ],
    costRange: "Typically about $100–$400 or more per month.",
    regulatoryStatus:
      "Not FDA-approved for injury recovery, and several have never been approved for any use. FDA has raised safety concerns about some of them in compounded drugs.",
    athleteNote: "Banned by the World Anti-Doping Agency (WADA).",
    unapproved: true,
    relevantFor: ["muscle", "tendon", "ligament", "any"],
  },
] as const satisfies readonly AlternativeTherapy[];

export type TherapyId = (typeof THERAPIES)[number]["id"];

export const THERAPY_IDS = THERAPIES.map((t) => t.id) as [TherapyId, ...TherapyId[]];

const byId = new Map<string, AlternativeTherapy>(
  THERAPIES.map((t) => [t.id, t as AlternativeTherapy]),
);

export function getTherapy(id: string): AlternativeTherapy | undefined {
  return byId.get(id);
}
