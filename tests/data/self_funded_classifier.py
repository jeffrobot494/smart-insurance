#!/usr/bin/env python3
import csv
import argparse
from collections import defaultdict

TRUTHY = {"1","Y","y","TRUE","True","true"}

def is_true(v):
    return str(v).strip() in TRUTHY

def norm(s):
    return (s or "").strip().lower()

def has_health_4A(type_welfare_benefit_code: str) -> bool:
    return "4A" in (type_welfare_benefit_code or "")

def build_schedA_index(sched_a_path: str):
    idx_by_begin = defaultdict(lambda: {"health": False, "stop": False})
    idx_by_end   = defaultdict(lambda: {"health": False, "stop": False})

    with open(sched_a_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            ein = (r.get("SCH_A_EIN") or "").strip()
            pn  = (r.get("SCH_A_PLAN_NUM") or "").strip()
            by  = (r.get("SCH_A_PLAN_YEAR_BEGIN_DATE") or "").strip()
            ey  = (r.get("SCH_A_PLAN_YEAR_END_DATE") or "").strip()
            if not ein or not pn:
                continue

            begin_year = by[:4] if len(by) >= 4 else ""
            end_year   = ey[:4] if len(ey) >= 4 else ""

            h = is_true(r.get("WLFR_BNFT_HEALTH_IND", ""))
            s = is_true(r.get("WLFR_BNFT_STOP_LOSS_IND", ""))

            if begin_year:
                keyb = (ein, pn, begin_year)
                if h: idx_by_begin[keyb]["health"] = True
                if s: idx_by_begin[keyb]["stop"]   = True
            if end_year:
                keye = (ein, pn, end_year)
                if h: idx_by_end[keye]["health"] = True
                if s: idx_by_end[keye]["stop"]   = True

    return idx_by_begin, idx_by_end

def classify_plan(header_row, sa_begin_idx, sa_end_idx):
    reasons = []
    sponsor = header_row.get("SPONSOR_DFE_NAME","")
    ein     = (header_row.get("SPONS_DFE_EIN") or "").strip()
    pn      = (header_row.get("SPONS_DFE_PN") or "").strip()
    twbc    = header_row.get("TYPE_WELFARE_BNFT_CODE","") or ""
    fby     = (header_row.get("FORM_PLAN_YEAR_BEGIN_DATE") or "").strip()
    fte     = (header_row.get("FORM_TAX_PRD") or "").strip()
    year_b  = fby[:4] if len(fby) >= 4 else ""
    year_e  = fte[:4] if len(fte) >= 4 else ""

    benefit_ins = is_true(header_row.get("BENEFIT_INSURANCE_IND","0"))
    benefit_ga  = is_true(header_row.get("BENEFIT_GEN_ASSET_IND","0"))
    funding_ins = is_true(header_row.get("FUNDING_INSURANCE_IND","0"))
    funding_ga  = is_true(header_row.get("FUNDING_GEN_ASSET_IND","0"))
    any_scha    = is_true(header_row.get("SCH_A_ATTACHED_IND","0")) or (str(header_row.get("NUM_SCH_A_ATTACHED_CNT","0")).strip() not in ("","0"))

    sa_h = False
    sa_s = False
    if ein and pn:
        if year_b:
            flags = sa_begin_idx.get((ein, pn, year_b))
            if flags:
                sa_h = sa_h or flags.get("health", False)
                sa_s = sa_s or flags.get("stop", False)
        if year_e:
            flags = sa_end_idx.get((ein, pn, year_e))
            if flags:
                sa_h = sa_h or flags.get("health", False)
                sa_s = sa_s or flags.get("stop", False)

    if sa_h:
        reasons.append("Schedule A shows health/medical coverage")
        if benefit_ins or funding_ins:
            reasons.append("Header insurance arrangement flags present")
        return ("Insured", reasons, {"ein": ein, "plan_number": pn, "plan_year_begin": fby, "plan_year_end": fte})

    if sa_s and not sa_h:
        reasons.append("Schedule A shows stop-loss but no medical")
        if benefit_ga or funding_ga:
            reasons.append("Header general-assets arrangement present")
        return ("Self-funded w/ stop-loss", reasons, {"ein": ein, "plan_number": pn, "plan_year_begin": fby, "plan_year_end": fte})

    if benefit_ga or funding_ga:
        reasons.append("Header indicates general assets funding/benefit")
        if any_scha:
            reasons.append("Schedule A attached (non-medical or unknown)")
            return ("Likely self-funded (non-medical Schedule A)", reasons, {"ein": ein, "plan_number": pn, "plan_year_begin": fby, "plan_year_end": fte})
        return ("Self-funded", reasons, {"ein": ein, "plan_number": pn, "plan_year_begin": fby, "plan_year_end": fte})

    if benefit_ins or funding_ins:
        reasons.append("Header indicates insurance arrangement but no SA health flag found")
        return ("Likely insured (needs Sched A verification)", reasons, {"ein": ein, "plan_number": pn, "plan_year_begin": fby, "plan_year_end": fte})

    if any_scha:
        reasons.append("Schedule A attached but lacks health/stop-loss flags for this plan-year")
        return ("Indeterminate (needs Sched A detail)", reasons, {"ein": ein, "plan_number": pn, "plan_year_begin": fby, "plan_year_end": fte})

    reasons.append("No Sched A and no clear arrangement flags")
    return ("Likely self-funded (absence of health Schedule A)", reasons, {"ein": ein, "plan_number": pn, "plan_year_begin": fby, "plan_year_end": fte})

def main():
    ap = argparse.ArgumentParser(description="Classify whether a company's medical plans are self-funded using Form 5500 + Schedule A CSVs.")
    ap.add_argument("--headers", default="f_5500_2024_latest.csv")
    ap.add_argument("--scheda",  default="F_SCH_A_2024_latest.csv")
    ap.add_argument("--company", required=True)
    ap.add_argument("--exact", action="store_true")
    ap.add_argument("--year", type=int, default=None)
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    if args.year and args.headers == "f_5500_2024_latest.csv":
        args.headers = f"f_5500_{args.year}_latest.csv"
    if args.year and args.scheda == "F_SCH_A_2024_latest.csv":
        args.scheda = f"F_SCH_A_{args.year}_latest.csv"

    sa_begin_idx, sa_end_idx = build_schedA_index(args.scheda)

    company_q = norm(args.company)
    plans = []

    with open(args.headers, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            sponsor = r.get("SPONSOR_DFE_NAME","")
            if args.exact:
                if norm(sponsor) != company_q:
                    continue
            else:
                if company_q not in norm(sponsor):
                    continue

            if args.year is not None:
                by = (r.get("FORM_PLAN_YEAR_BEGIN_DATE") or "")[:4]
                ey = (r.get("FORM_TAX_PRD") or "")[:4]
                ok = (by.isdigit() and int(by)==args.year) or (ey.isdigit() and int(ey)==args.year)
                if not ok:
                    if args.debug:
                        print(f"[SKIP-YEAR] {sponsor} BY={by} EY={ey} != {args.year}")
                    continue

            has4a = has_health_4A(r.get("TYPE_WELFARE_BNFT_CODE",""))
            ein   = (r.get("SPONS_DFE_EIN") or "").strip()
            pnum  = (r.get("SPONS_DFE_PN") or "").strip()
            by    = (r.get("FORM_PLAN_YEAR_BEGIN_DATE") or "")[:4]
            ey    = (r.get("FORM_TAX_PRD") or "")[:4]

            sa_h = False
            if ein and pnum:
                bflags = sa_begin_idx.get((ein, pnum, by), {})
                eflags = sa_end_idx.get((ein, pnum, ey), {})
                sa_h = (bflags.get("health", False) or eflags.get("health", False))
                if args.debug:
                    print(f"[SAIDX] {sponsor} PN={pnum} BY={by} EY={ey} -> {bflags},{eflags}")

            if not (has4a or sa_h):
                if args.debug:
                    print(f"[SKIP] {sponsor} PN={pnum} BY={by} EY={ey} no 4A or SA health")
                continue

            classification, reasons, meta = classify_plan(r, sa_begin_idx, sa_end_idx)
            plans.append({
                "plan_name": r.get("PLAN_NAME",""),
                "plan_number": meta["plan_number"],
                "ein": meta["ein"],
                "plan_year_begin": meta["plan_year_begin"],
                "plan_year_end": meta["plan_year_end"],
                "classification": classification,
                "reasons": reasons,
            })

    if not plans:
        print(f"NO MEDICAL PLANS FOUND for company match: '{args.company}'" + (f" in year {args.year}" if args.year else ""))
        return

    classes = [p["classification"] for p in plans]
    if any(c.startswith("Self-funded") or c.startswith("Likely self-funded") for c in classes):
        overall = "Self-funded (at least one plan)"
    elif all(c=="Insured" or c.startswith("Likely insured") for c in classes):
        overall = "Insured"
    else:
        overall = "Mixed/Indeterminate"

    print(f"Company: {args.company}")
    if args.year:
        print(f"Year filter: {args.year} (headers={args.headers}, scheda={args.scheda})")
    print(f"Overall: {overall}")
    for p in plans:
        print(f"  - Plan {p['plan_number']}  ({p['plan_name']})")
        print(f"    EIN: {p['ein']}  Year: {p['plan_year_begin']} → {p['plan_year_end']}")
        print(f"    Classification: {p['classification']}")
        for rsn in p["reasons"]:
            print(f"      • {rsn}")
        print()

if __name__ == "__main__":
    main()
