"""Seed data for SaleGuard — retailers, agents, and check libraries."""

from datetime import date

from sqlalchemy.orm import Session

from app.models.models import Agent, CheckLibrary, CheckType, Lead, Retailer, Transcript
from app.seed.real_transcript import get_real_transcript_utterances


def seed_all(db: Session):
    if db.query(Retailer).first():
        print("Database already seeded, skipping.")
        return

    retailers = _seed_retailers(db)
    agents = _seed_agents(db)
    _seed_checks(db, retailers)
    leads = _seed_sample_leads(db, retailers, agents)
    db.commit()
    _seed_synthetic_transcripts(db, leads)
    db.commit()
    print("Seed data loaded successfully.")


def _seed_retailers(db: Session) -> dict:
    retailers_data = [
        {"name": "AGL Energy", "code": "AGL"},
        {"name": "Origin Energy", "code": "ORIGIN"},
        {"name": "EnergyAustralia", "code": "EA"},
        {"name": "Alinta Energy", "code": "ALINTA"},
        {"name": "Aussie Broadband", "code": "ABB"},
        {"name": "Superloop", "code": "SLOOP"},
    ]
    retailers = {}
    for data in retailers_data:
        r = Retailer(**data)
        db.add(r)
        db.flush()
        retailers[data["code"]] = r
    return retailers


def _seed_agents(db: Session) -> list:
    agents_data = [
        {"name": "Sarah Johnson", "employee_id": "AGT001", "site": "Melbourne", "team_leader_name": "Mike Chen"},
        {"name": "James Wilson", "employee_id": "AGT002", "site": "Melbourne", "team_leader_name": "Mike Chen"},
        {"name": "Priya Patel", "employee_id": "AGT003", "site": "Sydney", "team_leader_name": "Lisa Wong"},
        {"name": "Tom Baker", "employee_id": "AGT004", "site": "Brisbane", "team_leader_name": "David Kumar"},
        {"name": "Mark Santos", "employee_id": "AGT005", "site": "Manila", "team_leader_name": "Rachel Tan"},
    ]
    agents = []
    for data in agents_data:
        a = Agent(**data)
        db.add(a)
        db.flush()
        agents.append(a)
    return agents


def _seed_checks(db: Session, retailers: dict):
    agl = retailers["AGL"]
    today = date.today()

    agl_checks = [
        {
            "code": "REC_DISC",
            "name": "Recording Disclosure",
            "description": "Agent must inform the customer that the call is being recorded",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 1,
            "evaluation_config": {
                "approved_script": "This call is being recorded for quality and training purposes.",
                "key_phrases": ["recorded", "quality", "training"],
                "match_threshold": 0.75,
                "speaker": "agent",
            },
        },
        {
            "code": "ID_VERIFY",
            "name": "Identity Verification",
            "description": "Agent must verify the customer's full name and date of birth",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 2,
            "evaluation_config": {
                "approved_script": "Can I please confirm your full name and date of birth for verification purposes?",
                "key_phrases": ["full name", "date of birth", "verify", "confirm"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "EIC",
            "name": "Explicit Informed Consent",
            "description": "Agent must obtain explicit informed consent before proceeding with the sale",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 3.0,
            "sort_order": 3,
            "evaluation_config": {
                "approved_script": "Based on everything we've discussed, do you agree to switch your electricity plan to AGL? I need a clear yes to proceed.",
                "key_phrases": ["agree", "switch", "consent", "yes to proceed", "confirm"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "RATE_CARD",
            "name": "Rate Card Accuracy",
            "description": "Agent must quote the correct rate card details matching CRM data",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 4,
            "evaluation_config": {
                "crm_fields": ["plan_rate", "plan_name"],
                "rate_card_reference": {},
                "comparison_rules": "Rate must match within 1 cent per kWh. Plan name must be substantially similar.",
                "speaker": "agent",
            },
        },
        {
            "code": "CUST_EMAIL",
            "name": "Customer Email Confirmation",
            "description": "Agent must read back and confirm the customer's email address",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": False,
            "weight": 1.0,
            "sort_order": 5,
            "evaluation_config": {
                "crm_fields": ["email"],
                "rate_card_reference": {},
                "comparison_rules": "Email must be read back letter by letter or confirmed by the customer.",
                "speaker": "agent",
            },
        },
        {
            "code": "COOL_OFF",
            "name": "Cooling-Off Period Disclosure",
            "description": "Agent must inform the customer about the 10-day cooling-off period",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 6,
            "evaluation_config": {
                "approved_script": "You have a 10 business day cooling-off period during which you can cancel this agreement without any penalty.",
                "key_phrases": ["cooling-off", "10 business day", "cancel", "no penalty"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "NO_DEAD_AIR",
            "name": "No Excessive Dead Air",
            "description": "No silences longer than 8 seconds during the call",
            "check_type": CheckType.C_BEHAVIOUR,
            "category": "Call Quality",
            "is_critical": False,
            "weight": 1.0,
            "sort_order": 7,
            "evaluation_config": {
                "behaviour_type": "dead_air",
                "threshold_seconds": 8,
                "max_occurrences": 2,
                "instructions": "Identify gaps between utterances longer than 8 seconds. More than 2 occurrences is a FAIL. Note: gaps at the very start or end of the call should be excluded.",
            },
        },
        {
            "code": "RAPPORT",
            "name": "Customer Rapport",
            "description": "Agent demonstrates professional and friendly communication",
            "check_type": CheckType.C_BEHAVIOUR,
            "category": "Call Quality",
            "is_critical": False,
            "weight": 1.0,
            "sort_order": 8,
            "evaluation_config": {
                "behaviour_type": "rapport",
                "instructions": "Evaluate whether the agent was professional, friendly, and built rapport with the customer. Check for: greeting by name, active listening (acknowledgements like 'I understand'), professional tone throughout, and proper closing. A robotic or rude interaction is a FAIL.",
            },
        },
        {
            "code": "NO_PRESSURE",
            "name": "No Pressure Selling",
            "description": "Agent must not use high-pressure sales tactics",
            "check_type": CheckType.C_BEHAVIOUR,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 9,
            "evaluation_config": {
                "behaviour_type": "pressure_selling",
                "instructions": "Evaluate whether the agent used high-pressure sales tactics. Look for: false urgency ('this offer expires today'), discouraging comparison shopping, dismissing customer concerns, repeated pushing after customer hesitation, or threatening consequences of not switching. Any of these is a FAIL.",
            },
        },
        {
            "code": "DMO_VDO",
            "name": "DMO/VDO Reference Price Comparison",
            "description": "Agent must reference the Default Market Offer or Victorian Default Offer comparison",
            "check_type": CheckType.B_FACTUAL,
            "category": "Compliance",
            "is_critical": False,
            "weight": 1.5,
            "sort_order": 10,
            "evaluation_config": {
                "crm_fields": ["dmo_comparison", "state"],
                "rate_card_reference": {},
                "comparison_rules": "If customer is in VIC, agent must reference VDO. For NSW/QLD/SA, must reference DMO. The percentage comparison mentioned must match CRM data within 2%.",
                "speaker": "agent",
            },
        },
    ]

    for check_data in agl_checks:
        check = CheckLibrary(
            retailer_id=agl.id,
            effective_from=today,
            version=1,
            **check_data,
        )
        db.add(check)

    origin = retailers["ORIGIN"]
    origin_checks = [
        {
            "code": "REC_DISC",
            "name": "Recording Disclosure",
            "description": "Agent must inform the customer that the call is being recorded",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 1,
            "evaluation_config": {
                "approved_script": "I'd like to let you know this call may be recorded for quality assurance and training.",
                "key_phrases": ["recorded", "quality assurance", "training"],
                "match_threshold": 0.75,
                "speaker": "agent",
            },
        },
        {
            "code": "EIC",
            "name": "Explicit Informed Consent",
            "description": "Agent must obtain explicit consent to proceed with the sale",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 3.0,
            "sort_order": 2,
            "evaluation_config": {
                "approved_script": "Do you understand and agree to proceed with switching your energy plan to Origin Energy?",
                "key_phrases": ["understand", "agree", "proceed", "switching", "Origin"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "RATE_CARD",
            "name": "Rate Card Accuracy",
            "description": "Agent must quote the correct rate card details",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 3,
            "evaluation_config": {
                "crm_fields": ["plan_rate", "plan_name"],
                "rate_card_reference": {},
                "comparison_rules": "Rate must match exactly or within rounding (1 cent). Plan name must match.",
                "speaker": "agent",
            },
        },
        {
            "code": "COOL_OFF",
            "name": "Cooling-Off Period",
            "description": "Customer must be told about cooling-off rights",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 4,
            "evaluation_config": {
                "approved_script": "You have 10 business days to change your mind and cancel without any fees or charges.",
                "key_phrases": ["10 business days", "change your mind", "cancel", "no fees"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "CONTRACT_TERM",
            "name": "Contract Term Disclosure",
            "description": "Agent must clearly state whether the plan has a lock-in contract or is ongoing",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 5,
            "evaluation_config": {
                "crm_fields": ["contract_term"],
                "rate_card_reference": {},
                "comparison_rules": "Agent must clearly state the contract length (e.g., 'no lock-in', '12-month benefit period'). Must match CRM data.",
                "speaker": "agent",
            },
        },
    ]

    for check_data in origin_checks:
        check = CheckLibrary(
            retailer_id=origin.id,
            effective_from=today,
            version=1,
            **check_data,
        )
        db.add(check)

    # --- Aussie Broadband checks (broadband-specific, not energy) ---
    abb = retailers["ABB"]
    abb_checks = [
        {
            "code": "REC_DISC",
            "name": "Recording Disclosure",
            "description": "Agent must inform the customer that the call is being recorded",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 1,
            "evaluation_config": {
                "approved_script": "Just letting you know this call is being recorded for quality and compliance purposes.",
                "key_phrases": ["recorded", "quality", "compliance"],
                "match_threshold": 0.75,
                "speaker": "agent",
            },
        },
        {
            "code": "ID_VERIFY",
            "name": "Account Holder Verification",
            "description": "Agent must verify the customer's full name and address on file",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 2,
            "evaluation_config": {
                "approved_script": "Can I please confirm your full name and the address where the service will be connected?",
                "key_phrases": ["full name", "address", "confirm", "connected"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "EIC",
            "name": "Explicit Informed Consent",
            "description": "Agent must obtain explicit consent to proceed with the broadband sign-up",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 3.0,
            "sort_order": 3,
            "evaluation_config": {
                "approved_script": "Based on what we've discussed, do you agree to sign up for this Aussie Broadband plan? I need a clear yes to proceed.",
                "key_phrases": ["agree", "sign up", "Aussie Broadband", "yes", "proceed"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "RATE_CARD",
            "name": "Rate Card Accuracy",
            "description": "Agent must correctly state the NBN speed tier and typical evening speed",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 4,
            "evaluation_config": {
                "crm_fields": ["speed_tier", "typical_evening_speed"],
                "rate_card_reference": {},
                "comparison_rules": "Speed tier (e.g., NBN 50, NBN 100) must match exactly. Typical evening speed must be stated and match CRM within 5 Mbps.",
                "speaker": "agent",
            },
        },
        {
            "code": "PLAN_PRICE",
            "name": "Monthly Price Accuracy",
            "description": "Agent must quote the correct monthly price including any discounts",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 5,
            "evaluation_config": {
                "crm_fields": ["plan_rate", "plan_name"],
                "rate_card_reference": {},
                "comparison_rules": "Monthly price must match exactly. Plan name must be substantially similar. If a discount period applies, both the discounted and standard price must be stated.",
                "speaker": "agent",
            },
        },
        {
            "code": "CONTRACT_TERM",
            "name": "Contract Term & Lock-in Disclosure",
            "description": "Agent must clearly state if there is a lock-in contract or if it's month-to-month",
            "check_type": CheckType.B_FACTUAL,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 6,
            "evaluation_config": {
                "crm_fields": ["contract_term"],
                "rate_card_reference": {},
                "comparison_rules": "Agent must clearly state the contract type (e.g., 'no lock-in contract', 'month-to-month', '6-month contract'). Must match CRM data.",
                "speaker": "agent",
            },
        },
        {
            "code": "NBN_TECH",
            "name": "NBN Connection Type",
            "description": "Agent must confirm the NBN technology type at the customer's address",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": False,
            "weight": 1.0,
            "sort_order": 7,
            "evaluation_config": {
                "crm_fields": ["nbn_technology"],
                "rate_card_reference": {},
                "comparison_rules": "Agent must mention the NBN technology type (FTTP, FTTC, FTTN, HFC, Fixed Wireless). Must match CRM data.",
                "speaker": "agent",
            },
        },
        {
            "code": "COOL_OFF",
            "name": "Cooling-Off Period Disclosure",
            "description": "Agent must inform the customer about the cooling-off period for broadband",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 8,
            "evaluation_config": {
                "approved_script": "You have a 10 business day cooling-off period during which you can cancel without penalty.",
                "key_phrases": ["cooling-off", "10 business day", "cancel", "no penalty", "without penalty"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "NO_PRESSURE",
            "name": "No Pressure Selling",
            "description": "Agent must not use high-pressure sales tactics",
            "check_type": CheckType.C_BEHAVIOUR,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 9,
            "evaluation_config": {
                "behaviour_type": "pressure_selling",
                "instructions": "Evaluate whether the agent used high-pressure sales tactics. Look for: false urgency, discouraging comparison, dismissing customer concerns, repeated pushing after hesitation, or threatening consequences. Any of these is a FAIL.",
            },
        },
        {
            "code": "RAPPORT",
            "name": "Customer Rapport",
            "description": "Agent demonstrates professional and friendly communication",
            "check_type": CheckType.C_BEHAVIOUR,
            "category": "Call Quality",
            "is_critical": False,
            "weight": 1.0,
            "sort_order": 10,
            "evaluation_config": {
                "behaviour_type": "rapport",
                "instructions": "Evaluate whether the agent was professional, friendly, and built rapport. Check for: greeting by name, active listening, professional tone, and proper closing.",
            },
        },
    ]

    for check_data in abb_checks:
        check = CheckLibrary(
            retailer_id=abb.id,
            effective_from=today,
            version=1,
            **check_data,
        )
        db.add(check)

    # --- EnergyAustralia checks ---
    ea = retailers["EA"]
    ea_checks = [
        {
            "code": "REC_DISC",
            "name": "Recording Disclosure",
            "description": "Agent must inform the customer that the call is being recorded",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 1,
            "evaluation_config": {
                "approved_script": "I'd like to advise you that this call is being recorded for quality assurance and compliance purposes.",
                "key_phrases": ["recorded", "quality assurance", "compliance"],
                "match_threshold": 0.75,
                "speaker": "agent",
            },
        },
        {
            "code": "ID_VERIFY",
            "name": "Identity Verification",
            "description": "Agent must verify the customer's full name and date of birth",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 2,
            "evaluation_config": {
                "approved_script": "For security, can I please verify your full name and date of birth?",
                "key_phrases": ["full name", "date of birth", "verify", "security"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "EIC",
            "name": "Explicit Informed Consent",
            "description": "Agent must obtain explicit informed consent before proceeding with the sale",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 3.0,
            "sort_order": 3,
            "evaluation_config": {
                "approved_script": "Do you understand and agree to switch your energy plan to EnergyAustralia? I need your verbal confirmation to proceed.",
                "key_phrases": ["understand", "agree", "switch", "EnergyAustralia", "confirmation", "proceed"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "RATE_CARD",
            "name": "Rate Card Accuracy",
            "description": "Agent must quote the correct rate card details matching CRM data",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 4,
            "evaluation_config": {
                "crm_fields": ["plan_rate", "plan_name"],
                "rate_card_reference": {},
                "comparison_rules": "The rate quoted must match CRM data within 1 cent per kWh. Plan name must be substantially similar.",
                "speaker": "agent",
            },
        },
        {
            "code": "CUST_EMAIL",
            "name": "Customer Email Confirmation",
            "description": "Agent must read back and confirm the customer's email address",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": False,
            "weight": 1.0,
            "sort_order": 5,
            "evaluation_config": {
                "crm_fields": ["email"],
                "rate_card_reference": {},
                "comparison_rules": "Email must be read back or confirmed by the customer.",
                "speaker": "agent",
            },
        },
        {
            "code": "CONTRACT_TERM",
            "name": "Contract Term Disclosure",
            "description": "Agent must clearly state whether the plan has a lock-in contract or is ongoing",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 6,
            "evaluation_config": {
                "crm_fields": ["contract_term"],
                "rate_card_reference": {},
                "comparison_rules": "Agent must clearly state contract type (e.g., 'no lock-in', '12-month benefit period'). Must match CRM data.",
                "speaker": "agent",
            },
        },
        {
            "code": "COOL_OFF",
            "name": "Cooling-Off Period",
            "description": "Agent must inform the customer about the cooling-off period",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 7,
            "evaluation_config": {
                "approved_script": "You have 10 business days from receiving your welcome pack to cancel this agreement without any penalty or charges.",
                "key_phrases": ["10 business days", "cancel", "no penalty", "welcome pack"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "NO_PRESSURE",
            "name": "No Pressure Selling",
            "description": "Agent must not use high-pressure sales tactics",
            "check_type": CheckType.C_BEHAVIOUR,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 8,
            "evaluation_config": {
                "behaviour_type": "pressure_selling",
                "instructions": "Evaluate whether the agent used high-pressure sales tactics. Look for: false urgency, discouraging comparison shopping, dismissing customer concerns, repeated pushing after hesitation. Any of these is a FAIL.",
            },
        },
        {
            "code": "RAPPORT",
            "name": "Customer Rapport",
            "description": "Agent demonstrates professional and friendly communication",
            "check_type": CheckType.C_BEHAVIOUR,
            "category": "Call Quality",
            "is_critical": False,
            "weight": 1.0,
            "sort_order": 9,
            "evaluation_config": {
                "behaviour_type": "rapport",
                "instructions": "Evaluate whether the agent was professional, friendly, and built rapport. Check for: greeting by name, active listening, professional tone, and proper closing.",
            },
        },
    ]

    for check_data in ea_checks:
        check = CheckLibrary(
            retailer_id=ea.id,
            effective_from=today,
            version=1,
            **check_data,
        )
        db.add(check)

    # --- Alinta Energy checks ---
    alinta = retailers["ALINTA"]
    alinta_checks = [
        {
            "code": "REC_DISC",
            "name": "Recording Disclosure",
            "description": "Agent must inform the customer that the call is being recorded",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 1,
            "evaluation_config": {
                "approved_script": "Please be aware this call is recorded for quality and training purposes.",
                "key_phrases": ["recorded", "quality", "training"],
                "match_threshold": 0.75,
                "speaker": "agent",
            },
        },
        {
            "code": "ID_VERIFY",
            "name": "Identity Verification",
            "description": "Agent must verify the customer's full name and date of birth",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 2,
            "evaluation_config": {
                "approved_script": "Can I confirm your full name and date of birth as they appear on your ID?",
                "key_phrases": ["full name", "date of birth", "confirm", "ID"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "EIC",
            "name": "Explicit Informed Consent",
            "description": "Agent must obtain explicit informed consent before proceeding with the sale",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 3.0,
            "sort_order": 3,
            "evaluation_config": {
                "approved_script": "Based on our discussion, do you agree to sign up for this Alinta Energy plan? I need a clear yes to proceed.",
                "key_phrases": ["agree", "sign up", "Alinta Energy", "yes", "proceed"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "RATE_CARD",
            "name": "Rate Card Accuracy",
            "description": "Agent must quote the correct rate card details matching CRM data",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 4,
            "evaluation_config": {
                "crm_fields": ["plan_rate", "plan_name"],
                "rate_card_reference": {},
                "comparison_rules": "Rate must match within 1 cent per kWh. Plan name must match.",
                "speaker": "agent",
            },
        },
        {
            "code": "COOL_OFF",
            "name": "Cooling-Off Period",
            "description": "Agent must inform the customer about the cooling-off period",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 5,
            "evaluation_config": {
                "approved_script": "You have a 10 business day cooling-off period where you can cancel without any fees.",
                "key_phrases": ["10 business day", "cooling-off", "cancel", "no fees"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "CONTRACT_TERM",
            "name": "Contract Term Disclosure",
            "description": "Agent must clearly state whether there is a lock-in or if the plan is ongoing",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 6,
            "evaluation_config": {
                "crm_fields": ["contract_term"],
                "rate_card_reference": {},
                "comparison_rules": "Agent must clearly state whether there is a lock-in or if the plan is ongoing/month-to-month. Must match CRM.",
                "speaker": "agent",
            },
        },
        {
            "code": "NO_PRESSURE",
            "name": "No Pressure Selling",
            "description": "Agent must not use high-pressure sales tactics",
            "check_type": CheckType.C_BEHAVIOUR,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 7,
            "evaluation_config": {
                "behaviour_type": "pressure_selling",
                "instructions": "Evaluate whether the agent used high-pressure tactics such as false urgency, dismissing concerns, or repeatedly pushing after the customer hesitates. Any of these is a FAIL.",
            },
        },
        {
            "code": "RAPPORT",
            "name": "Customer Rapport",
            "description": "Agent demonstrates professional and friendly communication",
            "check_type": CheckType.C_BEHAVIOUR,
            "category": "Call Quality",
            "is_critical": False,
            "weight": 1.0,
            "sort_order": 8,
            "evaluation_config": {
                "behaviour_type": "rapport",
                "instructions": "Evaluate whether the agent was professional and friendly. Check for: greeting, active listening, professional tone throughout, and courteous closing.",
            },
        },
    ]

    for check_data in alinta_checks:
        check = CheckLibrary(
            retailer_id=alinta.id,
            effective_from=today,
            version=1,
            **check_data,
        )
        db.add(check)

    # --- Superloop checks (broadband ISP — matches real team transcript) ---
    sloop = retailers["SLOOP"]
    sloop_checks = [
        {
            "code": "REC_DISC",
            "name": "Recording Disclosure",
            "description": "Agent must inform the customer that the call is being recorded BEFORE discussing account details",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 1,
            "evaluation_config": {
                "approved_script": "Please be advised that this call will be recorded for quality assurance and training purposes.",
                "key_phrases": ["recorded", "quality assurance", "training purposes"],
                "match_threshold": 0.75,
                "speaker": "agent",
            },
        },
        {
            "code": "REC_DISC_TIMING",
            "name": "Recording Disclosure Timing",
            "description": "Recording disclosure must be made at the START of the call, before discussing any personal or account information",
            "check_type": CheckType.C_BEHAVIOUR,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 2,
            "evaluation_config": {
                "behaviour_type": "disclosure_timing",
                "instructions": "Check whether the recording disclosure was made at the very beginning of the call, BEFORE any personal details (name, address, account info) were discussed. If the agent discussed the customer's address or any personal information before saying the call is recorded, this is a FAIL. The disclosure must come first.",
            },
        },
        {
            "code": "ID_VERIFY",
            "name": "Identity Verification",
            "description": "Agent must verify the customer's full name, date of birth, email, and phone number",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 3,
            "evaluation_config": {
                "approved_script": "Can you please verify your full name, date of birth, email address, and mobile number?",
                "key_phrases": ["full name", "date of birth", "email", "mobile number", "verify"],
                "match_threshold": 0.65,
                "speaker": "agent",
            },
        },
        {
            "code": "EIC",
            "name": "Explicit Informed Consent",
            "description": "Agent must obtain clear verbal consent from the customer to proceed with the sign-up",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 3.0,
            "sort_order": 4,
            "evaluation_config": {
                "approved_script": "Do you agree to sign up for this broadband plan? I need a clear yes to proceed.",
                "key_phrases": ["agree", "sign up", "yes", "proceed", "confirm"],
                "match_threshold": 0.65,
                "speaker": "agent",
            },
        },
        {
            "code": "RATE_CARD",
            "name": "Rate Card Accuracy",
            "description": "Agent must correctly state the NBN speed tier, download speed, and typical evening upload speed",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 5,
            "evaluation_config": {
                "crm_fields": ["speed_tier", "typical_evening_speed", "upload_speed"],
                "rate_card_reference": {},
                "comparison_rules": "Speed tier (e.g., NBN 25) must match exactly. Download speed and upload speed must be stated. Typical evening upload speed must match CRM within 2 Mbps.",
                "speaker": "agent",
            },
        },
        {
            "code": "PLAN_PRICE",
            "name": "Monthly Price Accuracy",
            "description": "Agent must quote the correct promotional and regular monthly price",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 6,
            "evaluation_config": {
                "crm_fields": ["plan_rate", "regular_price", "promo_duration"],
                "rate_card_reference": {},
                "comparison_rules": "Both the promotional price and the regular (post-promo) price must be stated correctly. The promotional duration must be mentioned. All values must match CRM data exactly.",
                "speaker": "agent",
            },
        },
        {
            "code": "CONTRACT_TERM",
            "name": "Contract Term Disclosure",
            "description": "Agent must clearly and consistently state the contract type",
            "check_type": CheckType.B_FACTUAL,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 7,
            "evaluation_config": {
                "crm_fields": ["contract_term"],
                "rate_card_reference": {},
                "comparison_rules": "Agent must clearly state the contract type. If agent says conflicting things (e.g., 'one-to-one contract' AND 'month-to-month'), this is confusing and should be flagged. Must match CRM data.",
                "speaker": "agent",
            },
        },
        {
            "code": "NBN_TECH",
            "name": "NBN Connection Type",
            "description": "Agent must confirm the NBN technology type at the customer's address",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": False,
            "weight": 1.0,
            "sort_order": 8,
            "evaluation_config": {
                "crm_fields": ["nbn_technology"],
                "rate_card_reference": {},
                "comparison_rules": "Agent must mention the NBN technology type (FTTP, FTTC, FTTN, HFC, Fixed Wireless). Must match CRM data.",
                "speaker": "agent",
            },
        },
        {
            "code": "TOTAL_MIN_COST",
            "name": "Total Minimum Cost Accuracy",
            "description": "Agent must correctly explain the total minimum cost and not confuse the customer with inapplicable fees",
            "check_type": CheckType.B_FACTUAL,
            "category": "Accuracy",
            "is_critical": False,
            "weight": 1.5,
            "sort_order": 9,
            "evaluation_config": {
                "crm_fields": ["total_minimum_cost"],
                "rate_card_reference": {},
                "comparison_rules": "The total minimum cost stated must match CRM data. If the agent mentions a higher figure and then dismisses it (e.g., 'don't worry about the $317'), evaluate whether this was confusing or misleading to the customer.",
                "speaker": "agent",
            },
        },
        {
            "code": "COOL_OFF",
            "name": "Cooling-Off Period Disclosure",
            "description": "Agent must inform the customer about the cooling-off period and their right to cancel",
            "check_type": CheckType.A_VERBATIM,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 10,
            "evaluation_config": {
                "approved_script": "You have a 10 business day cooling-off period during which you can cancel this agreement without any penalty.",
                "key_phrases": ["cooling-off", "10 business day", "cancel", "no penalty", "without penalty"],
                "match_threshold": 0.70,
                "speaker": "agent",
            },
        },
        {
            "code": "NO_PRESSURE",
            "name": "No Pressure Selling",
            "description": "Agent must not use high-pressure sales tactics or push past customer hesitation",
            "check_type": CheckType.C_BEHAVIOUR,
            "category": "Compliance",
            "is_critical": True,
            "weight": 2.0,
            "sort_order": 11,
            "evaluation_config": {
                "behaviour_type": "pressure_selling",
                "instructions": "Evaluate whether the agent used high-pressure sales tactics. Look for: false urgency, discouraging comparison shopping, dismissing customer concerns, repeated pushing after customer hesitation ('maybe I'll just stay where I am'), offering incentives (free modem) immediately after hesitation to prevent customer from leaving. If the customer expressed doubt and the agent used incentives to pressure them rather than respecting their hesitation, this is a FAIL.",
            },
        },
        {
            "code": "RAPPORT",
            "name": "Customer Rapport",
            "description": "Agent demonstrates professional and friendly communication throughout the call",
            "check_type": CheckType.C_BEHAVIOUR,
            "category": "Call Quality",
            "is_critical": False,
            "weight": 1.0,
            "sort_order": 12,
            "evaluation_config": {
                "behaviour_type": "rapport",
                "instructions": "Evaluate whether the agent was professional, friendly, and built rapport. Check for: greeting by name, active listening, professional tone, clear explanations, patience with customer questions, and proper closing. Note any instances of the agent being dismissive, confusing, or unclear.",
            },
        },
        {
            "code": "NO_DEAD_AIR",
            "name": "No Excessive Dead Air",
            "description": "No prolonged silences during the call",
            "check_type": CheckType.C_BEHAVIOUR,
            "category": "Call Quality",
            "is_critical": False,
            "weight": 1.0,
            "sort_order": 13,
            "evaluation_config": {
                "behaviour_type": "dead_air",
                "threshold_seconds": 8,
                "max_occurrences": 2,
                "instructions": "Identify gaps between utterances longer than 8 seconds. More than 2 occurrences is a FAIL. Gaps at the very start or end of the call should be excluded.",
            },
        },
    ]

    for check_data in sloop_checks:
        check = CheckLibrary(
            retailer_id=sloop.id,
            effective_from=today,
            version=1,
            **check_data,
        )
        db.add(check)


def _seed_sample_leads(db: Session, retailers: dict, agents: list) -> list:
    leads_data = [
        {
            "external_id": "LEAD-2024-001",
            "retailer_id": retailers["AGL"].id,
            "agent_id": agents[0].id,
            "campaign": "Energy Switch Q1",
            "customer_name": "John Smith",
            "plan_name": "AGL Value Saver",
            "plan_rate": "26.4c/kWh",
            "sale_date": date.today(),
            "crm_data": {
                "plan_rate": "26.4c/kWh",
                "plan_name": "AGL Value Saver",
                "email": "john.smith@email.com",
                "nmi": "6305012345",
                "state": "VIC",
                "dmo_comparison": "-12% below VDO",
                "contract_term": "No lock-in",
            },
        },
        {
            "external_id": "LEAD-2024-002",
            "retailer_id": retailers["ORIGIN"].id,
            "agent_id": agents[1].id,
            "campaign": "Broadband Bundle",
            "customer_name": "Emma Davis",
            "plan_name": "Origin Max Saver",
            "plan_rate": "24.8c/kWh",
            "sale_date": date.today(),
            "crm_data": {
                "plan_rate": "24.8c/kWh",
                "plan_name": "Origin Max Saver",
                "email": "emma.d@gmail.com",
                "nmi": "6305067890",
                "state": "NSW",
                "dmo_comparison": "-8% below DMO",
                "contract_term": "12-month benefit period",
            },
        },
        {
            "external_id": "LEAD-2024-003",
            "retailer_id": retailers["AGL"].id,
            "agent_id": agents[2].id,
            "campaign": "Energy Switch Q1",
            "customer_name": "Michael Chen",
            "plan_name": "AGL Essentials",
            "plan_rate": "28.1c/kWh",
            "sale_date": date.today(),
            "crm_data": {
                "plan_rate": "28.1c/kWh",
                "plan_name": "AGL Essentials",
                "email": "m.chen@outlook.com",
                "nmi": "6305011111",
                "state": "QLD",
                "dmo_comparison": "-5% below DMO",
                "contract_term": "No lock-in",
            },
        },
        {
            "external_id": "LEAD-2024-004",
            "retailer_id": retailers["ABB"].id,
            "agent_id": agents[3].id,
            "campaign": "NBN Signup Q3",
            "customer_name": "Sophie Taylor",
            "plan_name": "Aussie Broadband NBN 100",
            "plan_rate": "$79/month",
            "sale_date": date.today(),
            "crm_data": {
                "plan_rate": "$79/month",
                "plan_name": "Aussie Broadband NBN 100",
                "email": "sophie.t@gmail.com",
                "address": "42 Harbour St, Sydney NSW 2000",
                "speed_tier": "NBN 100",
                "typical_evening_speed": "90 Mbps",
                "nbn_technology": "FTTP",
                "contract_term": "No lock-in, month-to-month",
            },
        },
        {
            "external_id": "LEAD-2024-005",
            "retailer_id": retailers["ABB"].id,
            "agent_id": agents[0].id,
            "campaign": "NBN Signup Q3",
            "customer_name": "Ryan Mitchell",
            "plan_name": "Aussie Broadband NBN 50",
            "plan_rate": "$69/month",
            "sale_date": date.today(),
            "crm_data": {
                "plan_rate": "$69/month",
                "plan_name": "Aussie Broadband NBN 50",
                "email": "ryan.m@outlook.com",
                "address": "7 Collins St, Melbourne VIC 3000",
                "speed_tier": "NBN 50",
                "typical_evening_speed": "43 Mbps",
                "nbn_technology": "FTTN",
                "contract_term": "No lock-in, month-to-month",
            },
        },
        {
            "external_id": "LEAD-2024-006",
            "retailer_id": retailers["SLOOP"].id,
            "agent_id": agents[4].id,
            "campaign": "Broadband Outbound Q3",
            "customer_name": "Sophie Chen",
            "plan_name": "Superloop NBN 25",
            "plan_rate": "$42.90/month (promo)",
            "sale_date": date.today(),
            "crm_data": {
                "plan_rate": "$42.90/month",
                "regular_price": "$72.90/month",
                "promo_duration": "6 months",
                "plan_name": "Superloop NBN 25",
                "email": "[EMAIL]",
                "address": "[SERVICE_ADDRESS]",
                "speed_tier": "NBN 25",
                "typical_evening_speed": "25 Mbps",
                "upload_speed": "8.5 Mbps",
                "nbn_technology": "FTTP",
                "contract_term": "Month-to-month, no lock-in",
                "total_minimum_cost": "$42.90",
                "modem": "Netcom CF40 WiFi 6",
                "current_provider": "iPRIMUS",
            },
        },
    ]

    leads = []
    for data in leads_data:
        lead = Lead(**data)
        db.add(lead)
        db.flush()
        leads.append(lead)
    return leads


def _seed_synthetic_transcripts(db: Session, leads: list):
    """Pre-load realistic transcripts so demos work without audio/Deepgram."""

    # Lead 1: AGL — good call, should PASS most checks
    agl_pass_transcript = [
        {"index": 0, "speaker": 0, "speaker_label": "Agent", "text": "Good morning, this is Sarah from CIMET. Just letting you know, this call is being recorded for quality and training purposes. Am I speaking with John?", "start": 0.0, "end": 6.5, "words": []},
        {"index": 1, "speaker": 1, "speaker_label": "Customer", "text": "Yes, this is John Smith speaking.", "start": 7.0, "end": 8.5, "words": []},
        {"index": 2, "speaker": 0, "speaker_label": "Agent", "text": "Great, thanks John. I'm calling today because we've found a plan that could save you on your electricity bill. Before we go further, can I please confirm your full name and date of birth for verification purposes?", "start": 9.0, "end": 17.0, "words": []},
        {"index": 3, "speaker": 1, "speaker_label": "Customer", "text": "Sure, it's John David Smith, born 15th of March 1985.", "start": 17.5, "end": 21.0, "words": []},
        {"index": 4, "speaker": 0, "speaker_label": "Agent", "text": "Perfect, thank you. So John, I've been looking at your usage and I'd like to recommend the AGL Value Saver plan. It's 26.4 cents per kilowatt hour, which is actually 12 percent below the Victorian Default Offer. That's a really competitive rate.", "start": 21.5, "end": 33.0, "words": []},
        {"index": 5, "speaker": 1, "speaker_label": "Customer", "text": "That sounds pretty good. What's the catch? Is there a lock-in?", "start": 33.5, "end": 36.5, "words": []},
        {"index": 6, "speaker": 0, "speaker_label": "Agent", "text": "No catch at all. There's no lock-in contract, so you're free to leave at any time. And I also want to confirm your email on file is john.smith@email.com, is that correct?", "start": 37.0, "end": 46.0, "words": []},
        {"index": 7, "speaker": 1, "speaker_label": "Customer", "text": "Yes that's right.", "start": 46.5, "end": 47.5, "words": []},
        {"index": 8, "speaker": 0, "speaker_label": "Agent", "text": "Wonderful. Now based on everything we've discussed, do you agree to switch your electricity plan to AGL? I need a clear yes to proceed.", "start": 48.0, "end": 55.0, "words": []},
        {"index": 9, "speaker": 1, "speaker_label": "Customer", "text": "Yes, I agree. Let's go ahead with it.", "start": 55.5, "end": 58.0, "words": []},
        {"index": 10, "speaker": 0, "speaker_label": "Agent", "text": "Excellent, thank you John. Just one more important thing — you have a 10 business day cooling-off period during which you can cancel this agreement without any penalty. I'll also send you a confirmation email with all the details. Is there anything else I can help you with today?", "start": 58.5, "end": 70.0, "words": []},
        {"index": 11, "speaker": 1, "speaker_label": "Customer", "text": "No, that's all. Thanks for your help.", "start": 70.5, "end": 72.5, "words": []},
        {"index": 12, "speaker": 0, "speaker_label": "Agent", "text": "Thank you John, have a wonderful day!", "start": 73.0, "end": 75.0, "words": []},
    ]

    # Lead 2: Origin — agent quotes WRONG rate, misses cooling-off — should FAIL
    origin_fail_transcript = [
        {"index": 0, "speaker": 0, "speaker_label": "Agent", "text": "Hi there, this call may be recorded for quality assurance and training. Is this Emma?", "start": 0.0, "end": 5.0, "words": []},
        {"index": 1, "speaker": 1, "speaker_label": "Customer", "text": "Yes, hi.", "start": 5.5, "end": 6.0, "words": []},
        {"index": 2, "speaker": 0, "speaker_label": "Agent", "text": "Emma, I've got a great offer for you from Origin Energy. The Origin Max Saver plan at 22.5 cents per kilowatt hour. It's one of the best rates we have right now.", "start": 6.5, "end": 15.5, "words": []},
        {"index": 3, "speaker": 1, "speaker_label": "Customer", "text": "Okay, what's the contract like?", "start": 16.0, "end": 17.5, "words": []},
        {"index": 4, "speaker": 0, "speaker_label": "Agent", "text": "It's a 12 month benefit period, so you get that great rate locked in for a full year. Do you understand and agree to proceed with switching your energy plan to Origin Energy?", "start": 18.0, "end": 27.0, "words": []},
        {"index": 5, "speaker": 1, "speaker_label": "Customer", "text": "Yeah, alright, let's do it.", "start": 27.5, "end": 29.0, "words": []},
        {"index": 6, "speaker": 0, "speaker_label": "Agent", "text": "Great, I'll get that set up for you. You'll receive a confirmation email shortly. Thanks Emma, have a good one!", "start": 29.5, "end": 35.5, "words": []},
    ]

    # Lead 3: AGL — mixed results
    agl_mixed_transcript = [
        {"index": 0, "speaker": 0, "speaker_label": "Agent", "text": "Hello, this call is being recorded for quality and training purposes. Can I speak with Michael Chen please?", "start": 0.0, "end": 5.5, "words": []},
        {"index": 1, "speaker": 1, "speaker_label": "Customer", "text": "Yeah, that's me.", "start": 6.0, "end": 7.0, "words": []},
        {"index": 2, "speaker": 0, "speaker_label": "Agent", "text": "Michael, I've got an excellent energy plan for you. The AGL Essentials plan at 28.1 cents per kilowatt hour. That's 5 percent below the DMO for Queensland.", "start": 7.5, "end": 16.0, "words": []},
        {"index": 3, "speaker": 1, "speaker_label": "Customer", "text": "Hmm, I'm not sure. I was thinking of checking a few other providers.", "start": 16.5, "end": 20.0, "words": []},
        {"index": 4, "speaker": 0, "speaker_label": "Agent", "text": "Look mate, I'll be honest, this deal won't last. We've only got a few spots left at this rate and if you don't lock it in today, I can't guarantee it'll still be available tomorrow. You don't want to miss out.", "start": 20.5, "end": 31.0, "words": []},
        {"index": 5, "speaker": 1, "speaker_label": "Customer", "text": "Oh, okay. I guess I'll go with it then.", "start": 31.5, "end": 34.0, "words": []},
        {"index": 6, "speaker": 0, "speaker_label": "Agent", "text": "Smart choice. So you agree to switch to AGL Essentials, yes?", "start": 34.5, "end": 38.0, "words": []},
        {"index": 7, "speaker": 1, "speaker_label": "Customer", "text": "Yes.", "start": 38.5, "end": 39.0, "words": []},
        {"index": 8, "speaker": 0, "speaker_label": "Agent", "text": "Done. You've got a 10 business day cooling-off period if you change your mind, you can cancel without penalty. No lock-in contract either. I'll send you the details. Cheers.", "start": 39.5, "end": 48.0, "words": []},
    ]

    # Lead 4: Aussie Broadband — good call, should PASS
    abb_pass_transcript = [
        {"index": 0, "speaker": 0, "speaker_label": "Agent", "text": "Hi there, this is Tom from CIMET. Just letting you know this call is being recorded for quality and compliance purposes. Am I speaking with Sophie?", "start": 0.0, "end": 7.0, "words": []},
        {"index": 1, "speaker": 1, "speaker_label": "Customer", "text": "Yes, Sophie Taylor here.", "start": 7.5, "end": 9.0, "words": []},
        {"index": 2, "speaker": 0, "speaker_label": "Agent", "text": "Thanks Sophie. Can I please confirm your full name and the address where the service will be connected?", "start": 9.5, "end": 14.5, "words": []},
        {"index": 3, "speaker": 1, "speaker_label": "Customer", "text": "It's Sophie Louise Taylor, 42 Harbour Street, Sydney, 2000.", "start": 15.0, "end": 19.0, "words": []},
        {"index": 4, "speaker": 0, "speaker_label": "Agent", "text": "Perfect. So Sophie, I've checked your address and great news — you've got FTTP fibre to the premises, which is the best NBN technology. I'd recommend the Aussie Broadband NBN 100 plan. That's the 100 megabit speed tier, and on this connection you can expect a typical evening speed of around 90 Mbps.", "start": 19.5, "end": 34.0, "words": []},
        {"index": 5, "speaker": 1, "speaker_label": "Customer", "text": "That sounds great. How much is it per month?", "start": 34.5, "end": 37.0, "words": []},
        {"index": 6, "speaker": 0, "speaker_label": "Agent", "text": "The Aussie Broadband NBN 100 is $79 per month. And there's no lock-in contract, it's completely month-to-month so you can cancel anytime.", "start": 37.5, "end": 45.0, "words": []},
        {"index": 7, "speaker": 1, "speaker_label": "Customer", "text": "Nice, no lock-in is a big plus. I think I'd like to go ahead.", "start": 45.5, "end": 49.0, "words": []},
        {"index": 8, "speaker": 0, "speaker_label": "Agent", "text": "Wonderful. So based on what we've discussed, do you agree to sign up for this Aussie Broadband plan? I need a clear yes to proceed.", "start": 49.5, "end": 56.0, "words": []},
        {"index": 9, "speaker": 1, "speaker_label": "Customer", "text": "Yes, I agree. Let's do it.", "start": 56.5, "end": 58.5, "words": []},
        {"index": 10, "speaker": 0, "speaker_label": "Agent", "text": "Fantastic. And just so you know, you have a 10 business day cooling-off period during which you can cancel without penalty. I'll send all the plan details and your confirmation to sophie.t@gmail.com. Is there anything else I can help you with?", "start": 59.0, "end": 71.0, "words": []},
        {"index": 11, "speaker": 1, "speaker_label": "Customer", "text": "No that's everything. Thanks Tom!", "start": 71.5, "end": 73.5, "words": []},
        {"index": 12, "speaker": 0, "speaker_label": "Agent", "text": "You're welcome Sophie. Have a great day!", "start": 74.0, "end": 76.0, "words": []},
    ]

    # Lead 5: Aussie Broadband — wrong speed, missing tech type — should FAIL
    abb_fail_transcript = [
        {"index": 0, "speaker": 0, "speaker_label": "Agent", "text": "Hey, this is Sarah calling from CIMET. This call is recorded for quality and compliance. Is this Ryan?", "start": 0.0, "end": 5.5, "words": []},
        {"index": 1, "speaker": 1, "speaker_label": "Customer", "text": "Yeah, Ryan Mitchell.", "start": 6.0, "end": 7.0, "words": []},
        {"index": 2, "speaker": 0, "speaker_label": "Agent", "text": "Ryan, can I confirm your full name and address where the broadband will be connected?", "start": 7.5, "end": 12.0, "words": []},
        {"index": 3, "speaker": 1, "speaker_label": "Customer", "text": "Ryan Mitchell, 7 Collins Street, Melbourne 3000.", "start": 12.5, "end": 16.0, "words": []},
        {"index": 4, "speaker": 0, "speaker_label": "Agent", "text": "Great. So I've got a great plan for you, the Aussie Broadband NBN 50. It's $69 a month and you'll get speeds of about 50 Mbps in the evenings. No lock-in contract either, totally month-to-month.", "start": 16.5, "end": 28.0, "words": []},
        {"index": 5, "speaker": 1, "speaker_label": "Customer", "text": "Alright, that sounds reasonable. Let's go ahead.", "start": 28.5, "end": 31.0, "words": []},
        {"index": 6, "speaker": 0, "speaker_label": "Agent", "text": "So you agree to sign up for the Aussie Broadband NBN 50 plan? I just need a clear yes.", "start": 31.5, "end": 36.5, "words": []},
        {"index": 7, "speaker": 1, "speaker_label": "Customer", "text": "Yes, I agree.", "start": 37.0, "end": 38.0, "words": []},
        {"index": 8, "speaker": 0, "speaker_label": "Agent", "text": "Done, I'll send you the confirmation. You've got 10 business days to cancel without penalty if you change your mind. Thanks Ryan!", "start": 38.5, "end": 46.0, "words": []},
    ]

    # Lead 6: Superloop (real team transcript) — multiple compliance issues expected
    real_transcript = get_real_transcript_utterances()

    transcripts_data = [
        (leads[0], agl_pass_transcript),
        (leads[1], origin_fail_transcript),
        (leads[2], agl_mixed_transcript),
        (leads[3], abb_pass_transcript),
        (leads[4], abb_fail_transcript),
        (leads[5], real_transcript),
    ]

    for lead, utterances in transcripts_data:
        word_count = sum(len(u["text"].split()) for u in utterances)
        speakers = set(u["speaker"] for u in utterances)
        t = Transcript(
            lead_id=lead.id,
            recording_id=None,
            utterances=utterances,
            speaker_count=len(speakers),
            word_count=word_count,
            avg_confidence=0.95,
        )
        db.add(t)
