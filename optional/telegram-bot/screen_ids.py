"""Every screen's ID (#196) and where it sits (#344): the one list of them.

Issues name screens by these IDs (`DL-1`). An admin or a tester can turn them on for
themselves (⚙️ Settings → 🧪 Tester, #344): each screen's message then starts with its ID, in
monospace (one tap copies it in Telegram). A new screen takes the next free number in its
area; a removed one's ID goes to `RETIRED`, never to be used again.

Each `Screen` names its parent: the screen whose button opens it. The main menu is a
keyboard, not a screen, so its sections hang under ST-2, the welcome it comes with. What
arrives unasked has none: /start (ST-2, ST-3), the notifications (NT) and what any moment
can bring (AN). `scripts/build_screen_map.py` draws
the tree (docs/screen-map.html).

Most screens start with a translation used only there (`keys`), and the translator puts the
ID in front of it. A few share their text with another screen (an offer's page is the same
for its poster and for others; only the buttons differ): they have no keys, and the code
that builds them names them with `t.screen("OP-5")` (`LABELLED_IN_CODE`). The Mini App's page
shows none (`shows_id=False`, #320). `sample` is the translation the map shows for a screen
without keys.

To remove the IDs from the bot: the user's setting, I18n's translators with IDs, and the
`t.screen(...)` calls.
"""

from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class Screen:
    id: str
    parent: str | None
    keys: tuple[str, ...] = ()  # the translations that start its message
    note: str = ""
    shows_id: bool = True
    sample: str | None = None  # for the map, when it has no keys

    @property
    def labelled_in_code(self) -> bool:
        return self.shows_id and not self.keys

    @property
    def order(self) -> tuple[str, int]:
        """DL-2 before DL-10."""
        area, number = self.id.split("-")
        return area, int(number)


class ScreenTree:
    """The screens as a tree: each one's children, and the way down to it."""

    def __init__(self, screens: Iterable[Screen]) -> None:
        self._screens = {screen.id: screen for screen in screens}
        for screen in self._screens.values():
            self.path(screen.id)  # refuses a cycle now, not when the map is drawn

    def get(self, screen_id: str) -> Screen:
        return self._screens[screen_id]

    def roots(self) -> list[Screen]:
        return sorted((s for s in self._screens.values() if s.parent is None), key=_order)

    def children(self, screen_id: str) -> list[Screen]:
        found = (s for s in self._screens.values() if s.parent == screen_id)
        return sorted(found, key=_order)

    def path(self, screen_id: str) -> list[Screen]:
        """From the root down to the screen."""
        path = [self._screens[screen_id]]
        while (parent := path[-1].parent) is not None:
            if any(screen.id == parent for screen in path):
                raise ValueError(f"screens in a cycle: {' <- '.join(s.id for s in path)}")
            path.append(self._screens[parent])
        return path[::-1]


def _order(screen: Screen) -> tuple[str, int]:
    return screen.order


S = Screen
SCREENS: tuple[Screen, ...] = (
    # Start
    S(
        "ST-2",
        None,
        ("start-welcome",),
        "a guest's /start, the very first too: the language row, two of HE-1's questions, ❓ All "
        "questions; the guest menu under the line below it (#600)",
    ),
    S("ST-3", None, ("start-welcome-back",), "/start again, signed up"),
    S("ST-4", None, ("start-departed",), "a deleted account's Telegram account, while kept (#480)"),
    # Profile setup: name, place (SH-2, SH-3), privacy, phone
    S("PS-1", "ST-2", ("onboarding-ask-name",), "👤 Set up profile: the name"),
    S("PS-3", "SH-3", ("privacy-short",), "the terms: ✖️ Cancel, 📜 Terms, ✅ I agree (#481)"),
    S("PS-4", "PS-3", ("onboarding-ask-phone",), "the phone number"),
    S("PS-5", "PS-4", ("onboarding-ask-code",), "the SMS code"),
    S("PS-6", "PS-5", ("onboarding-done",), "the profile is set up"),
    S("PS-7", "PS-1", ("onboarding-cancelled",), "setting up stopped: /start goes on (#354)"),
    # Offers
    S(
        "OF-3",
        "ST-2",
        (
            "feed-header",
            "feed-empty-city",
            "feed-empty-country",
            "feed-empty-other",
            "feed-empty-none",
            "feed-empty-nothing",
        ),
        "the menu's Offers: the list, or why it's empty",
    ),
    # Offer page
    S("OP-1", "OF-3", note="an offer's page, someone else's", sample="card-in-person"),
    S("OP-2", "OP-1", ("respond-confirm-accept", "respond-confirm-counter"), "confirm a response"),
    S("OP-3", "OP-1", ("respond-ask-counter",), "💬 Counter-offer: the amount"),
    S("OP-4", "OP-1", note="the same, ➕ More", sample="card-in-person"),
    S("OP-5", "OF-3", note="an offer's page, your own", sample="card-in-person"),
    S("OP-6", "OP-5", ("cancel-quote-confirm",), "cancel your offer?"),
    S("OP-7", "OP-1", ("error-response-limit",), "no responses left today, VIP ones for Stars"),
    S("OP-8", "OP-1", ("error-new-account-deals",), "a new account can't respond yet"),
    S("OP-9", "OP-2", ("respond-sent",), "the response sent (#354)"),
    # New offer
    S("NO-1", "ST-2", note="the menu's New offer: the form", sample="newquote-title"),
    S("NO-2", "NO-1", note="the form, choosing a currency", sample="newquote-hint-pick"),
    S("NO-3", "NO-1", note="the form, choosing a place", sample="newquote-hint-place"),
    S("NO-4", "NO-1", note='the form, "did you mean...?"', sample="newquote-typo-option"),
    S("NO-5", "NO-1", ("newquote-posted",), "posted"),
    S("NO-6", "NO-1", ("error-quote-limit",), "no new offers left today"),
    S("NO-7", "NO-1", note="the form, the note (#198)", sample="newquote-hint-note"),
    S(
        "NO-8",
        "NO-1",
        ("error-new-account-offers",),
        "a new account's free offers all live: one more as a VIP offer for Stars (#503)",
    ),
    S(
        "NO-9",
        "OP-5",
        note="✏️ Change offer: the form, filled in (#393)",
        sample="newquote-title-change",
    ),
    S(
        "NO-10",
        "NT-5",
        note="🔄 Renew offer: the form, filled in, up again for its lifetime (#418)",
        sample="newquote-title-renew",
    ),
    S("NO-11", "NT-5", ("error-renewal-limit",), "no renewals left, VIP ones for Stars (#418)"),
    # Responses to your offer
    S("RE-1", "OP-5", ("responses-title",), "the responses to your offer"),
    S("RE-2", "RE-1", ("responses-confirm",), "pick this one?"),
    S("RE-3", "RE-2", ("responses-done",), "picked: a deal"),
    S("RE-4", "RE-3", ("deal-chat-key",), "the deal's chat key, to both"),
    # Deal
    S("DL-1", "MA-5", note="the deal", sample="deal-status"),
    S("DL-2", "NT-8", ("complaint-answer-ask",), "answer a complaint about you"),
    S("DL-3", "DL-2", note="answering a complaint: evidence", sample="complaint-ask-evidence"),
    S("DL-4", "DL-3", ("complaint-answer-confirm",), "send the answer?"),
    S("DL-8", "DL-14", ("deal-location-ask",), "the meeting place"),
    S("DL-9", "DL-1", ("deal-confirm-ask",), "did the exchange happen?"),
    S("DL-10", "DL-9", ("rating-ask",), "rate the other side"),
    S("DL-11", "DL-10", ("rating-ask-reason",), "the rating's reason"),
    S("DL-12", "DL-11", ("rating-ask-comment",), "the rating's comment"),
    S("DL-13", "DL-1", note="the deal, ➕ More", sample="deal-status"),
    S("DL-14", "DL-13", ("deal-change-ask",), "✏️ Change the deal"),
    S("DL-15", "DL-14", ("deal-amend-ask",), "the new amount"),
    S("DL-16", "DL-15", ("deal-amend-preview",), "the new amount, previewed"),
    S("DL-17", "DL-14", ("deal-mode-ask",), "in person or online"),
    S("DL-18", "DL-13", ("complaint-ask",), "a complaint: what happened"),
    S("DL-19", "DL-18", ("complaint-ask-description",), "a complaint: in your words"),
    S("DL-20", "DL-19", note="a complaint: evidence", sample="complaint-ask-evidence"),
    S("DL-21", "DL-20", ("complaint-confirm",), "send the complaint?"),
    S("DL-22", "DL-21", ("chat-share-ask",), "share the chat with the moderators?"),
    S("DL-23", "DL-1", ("deal-reveal-confirm",), "show your contact?"),
    S("DL-24", "DL-13", ("deal-cancel-ask",), "cancel the deal: why"),
    S("DL-25", "DL-24", ("deal-cancel-confirm",), "cancel the deal?"),
    S(
        "DL-27",
        "DL-1",
        ("deal-contact-received", "deal-contact-call"),
        "a contact shared, to the other side; or from 🤙 Call (#332)",
    ),
    S("MP-1", "DL-1", note="the meeting place and time on a map (#297, #312)", shows_id=False),
    S("DL-28", "DL-8", ("deal-location-sharing",), "sharing: the other side sees you (#354)"),
    S(
        "DL-29",
        "DL-8",
        note="at the meeting place: you're there (#354)",
        sample="deal-location-you-at-place",
    ),
    S("DL-31", "DL-14", ("deal-change-sent",), "a change proposed: sent (#354)"),
    S("DL-32", "DL-10", ("rating-thanks",), "rated: thanks (#354)"),
    S("DL-33", "DL-12", ("rating-comment-saved",), "the rating's comment saved (#354)"),
    S("DL-34", "DL-20", ("complaint-evidence-added",), "a complaint's file added (#354)"),
    # Deal chat
    S("CH-1", "DL-1", ("relay-started",), "💬 Chat: the chat begins"),
    S("CH-2", "CH-1", ("relay-header",), "a message relayed, under its header"),
    S("CH-3", "CH-1", ("relay-history-ask",), "📜 History: the key"),
    S("CH-4", "CH-3", ("relay-history-title",), "📜 History"),
    S("CH-5", "CH-1", ("relay-notice",), "how the deal chat works, the first time (#354)"),
    S("CH-6", "CH-1", ("relay-exited",), "🚪 Exit chat: left (#354)"),
    # My activity
    S("MA-1", "ST-2", ("activity-title",), "the menu's My activity"),
    S("MA-2", "MA-1", ("activity-quotes-choose",), "my offers: which"),
    S("MA-3", "MA-2", ("activity-quotes-title",), "my offers"),
    S("MA-4", "MA-1", ("activity-deals-choose",), "my deals: which"),
    S("MA-5", "MA-4", ("activity-deals-title",), "my deals"),
    # More and profile
    S("MO-1", "ST-2", ("menu-more-title",), "the menu's More, marked ➖: open (#354, #360)"),
    S("MO-2", "MO-1", ("profile-card",), "my profile"),
    # Settings
    S("SE-1", "MO-1", ("settings-title",), "⚙️ Settings"),
    S("SE-2", "SE-1", ("settings-notifications-title",), "🔔 Notifications"),
    S("SE-3", "SE-1", ("language-choose",), "🌐 Language"),
    S("SE-4", "SE-1", ("searches-title",), "🔖 Saved searches"),
    S("SE-5", "SE-4", ("feed-ask-pair",), "a saved search's currencies"),
    S("SE-7", "SE-1", ("blocked-title",), "🚫 Blocked users"),
    S("SE-8", "SE-1", ("deletion-explain", "deletion-pending"), "🗑 Delete my account"),
    S("SE-9", "OF-3", ("feed-save-ask",), "🔔 on the offers list (#306)"),
    S("SE-10", "SE-9", ("error-search-limit",), "as many as can be kept: one more for Stars"),
    S("SE-11", "SE-1", ("tester-title",), "🧪 Tester: screen IDs, admins and testers only (#344)"),
    S("SE-12", "SE-3", ("language-changed",), "the language changed (#354)"),
    S("SE-13", "SE-1", ("phone-change-ask",), "📱 a new number (#354)"),
    S("SE-14", "SE-13", ("phone-change-done",), "the number changed (#354)"),
    S("SE-15", "NT-18", ("role-accepted", "role-declined"), "a role accepted or declined (#354)"),
    S("SE-16", "SE-1", ("my-data-explain",), "📤 My data: everything kept, as a file (#482)"),
    S("SE-17", "SE-16", ("my-data-sent",), "the file, sent below SE-16 (#482)"),
    # How it works
    S(
        "HE-1",
        "MO-1",
        ("help-intro",),
        "❓ How it works; also the welcome's ❓ All questions (#600)",
    ),
    S(
        "HE-2",
        "HE-1",
        (
            "help-about",
            "help-disclaimer",
            "help-data",
            "help-trade",
            "help-safety",
            "help-chat",
            "help-reputation",
            "help-problems",
            "help-limits",
        ),
        "one of its topics; 🔄 and 🛡 straight from the welcome too (#600)",
    ),
    # Shared screens, under the first that opens them
    S(
        "SH-1",
        "NO-1",
        ("location-ask",),
        "the location check, optional, before posting or responding (#589)",
    ),
    S(
        "SH-2",
        "ST-2",
        ("onboarding-ask-place", "feed-choose-country"),
        "the one country picker, wherever a place is picked (#329): 📋 Offers asks it first, "
        "and its first pick is the user's country (#600)",
    ),
    S(
        "SH-3",
        "SH-2",
        ("onboarding-ask-city", "feed-choose-city"),
        "the one city picker (#329)",
    ),
    S("SH-4", "OP-1", ("participant-title",), "👤 Info: who it is"),
    S("SH-5", "SH-4", ("block-confirm",), "block them?"),
    S("SH-6", "SH-4", ("report-ask",), "report: why"),
    S("SH-7", "SH-6", ("report-ask-comment",), "report: in your words"),
    S("SH-8", "SH-4", ("participant-disclaimer",), "what the reputation means"),
    S("SH-9", "SH-1", ("location-checked",), "the location checked (#354)"),
    S("SH-10", "SH-7", ("report-thanks",), "reported: thanks (#354)"),
    S("SH-11", "SH-5", ("block-done",), "blocked (#354)"),
    S("SH-12", "SH-2", ("onboarding-pick-country",), "a typed country: which one? (#354)"),
    S("SH-13", "SH-3", ("onboarding-pick-place",), "a typed city: which one? (#354)"),
    S("SH-14", "SH-15", ("privacy-policy",), "🔒 the privacy policy, also from HE-2 (#481)"),
    S("SH-15", "PS-3", ("privacy-terms",), "📜 the terms, also from AN-8 and HE-2 (#481)"),
    # Notifications
    S("NT-1", None, ("notify-new-response-accept", "notify-new-response-counter"), "a response"),
    S("NT-2", None, ("notify-selected",), "your response picked: a deal"),
    S("NT-3", None, ("notify-quote-cancelled",), "an offer you responded to, cancelled"),
    S("NT-4", None, ("notify-search-match",), "a saved search matched"),
    S(
        "NT-5",
        None,
        ("notify-quote-expiring", "notify-quote-expiring-responses"),
        "your offer expires soon",
    ),
    S("NT-6", None, ("notify-meeting-soon",), "the meeting is soon"),
    S("NT-7", None, ("notify-deal-change-proposed",), "a change to the deal proposed"),
    S("NT-8", None, ("notify-complaint-filed",), "a complaint about you"),
    S("NT-9", None, ("notify-deal-confirm-reminder",), "confirm the exchange"),
    S(
        "NT-10",
        None,
        ("notify-deal-unconfirmed", "notify-deal-unconfirmed-silent"),
        "the deal unconfirmed",
    ),
    S(
        "NT-11",
        None,
        (
            "notify-deal-resolved",
            "notify-complaint-answered",
            "notify-complaint-decided-yours",
            "notify-complaint-decided-about-you",
        ),
        "a complaint answered or decided",
    ),
    S("NT-12", None, ("notify-deal-completed",), "the deal completed"),
    S("NT-13", None, ("notify-deal-fell-through",), "the deal fell through"),
    S("NT-14", None, ("notify-place-moved",), "the meeting place moved"),
    S("NT-15", None, ("notify-place-missing",), "no meeting place yet"),
    S("NT-16", None, ("notify-deal-cancelled",), "the deal cancelled"),
    S("NT-17", None, ("vip-thanks",), "thanks for the Stars"),
    S("NT-18", None, ("notify-role-offered",), "a role offered by the admins (#289)"),
    S("NT-19", None, ("notify-place-chosen",), "the other side picked a place, not where (#296)"),
    S("NT-20", None, ("notify-place-revealed",), "both places picked: both seen"),
    S("NT-21", None, ("notify-place-set-alone",), "the deadline, one place picked: the place"),
    S("NT-22", None, ("notify-place-settled",), "two picks this close: settled (#312)"),
    # Found without an ID by #354's census
    S("NT-23", None, ("deal-location-other-arrived",), "the other side is at the place"),
    S("NT-26", None, ("deal-location-incoming",), "the other side's live location, coming"),
    S("NT-27", None, ("deal-location-other-stopped",), "the other side turned theirs off"),
    S(
        "NT-28",
        None,
        ("notify-deal-change-accepted", "notify-deal-change-declined"),
        "your proposed change: accepted or declined",
    ),
    S("NT-29", None, ("notify-deal-confirmed-by-other",), "the other side confirmed: you too"),
    S("NT-30", None, ("notify-new-rating",), "a new rating"),
    S("NT-31", None, ("notify-chat-shared",), "the other side shared the chat with the admins"),
    S("NT-32", None, ("notify-not-selected",), "your response wasn't picked"),
    S("NT-33", None, ("notify-quote-withdrawn",), "the offer you responded to is gone"),
    S("NT-34", None, ("notify-quote-removed",), "the moderators took your offer down"),
    S("NT-35", None, ("notify-account-deleted",), "your account deleted"),
    S("NT-37", None, ("notify-account-warned",), "a warning from the moderators"),
    S(
        "NT-38",
        None,
        ("notify-account-deals-limited", "notify-account-offers-blocked"),
        "your account restricted",
    ),
    S("NT-39", None, ("notify-account-restriction-lifted",), "the restriction lifted"),
    S("NT-40", None, ("notify-tester-reset",), "a tester's data reset by the admins"),
    S("NT-41", None, ("notify-quote-changed",), "the offer you responded to changed (#393)"),
    S("NT-42", None, ("notify-support-answer",), "the moderators' answer, with ✍️ Reply (#464)"),
    S("NT-43", None, ("notify-partner-leaving",), "someone you dealt with lately leaves (#480)"),
    # Anytime
    S("AN-1", None, ("cancel-done", "cancel-nothing"), "/cancel"),
    S("AN-2", None, ("button-expired",), "a button too old"),
    S("AN-3", None, ("fallback-unknown",), "a message I don't understand"),
    S("AN-4", None, ("vip-info",), "ℹ️ How it works: free and VIP (#285)"),
    S("AN-5", None, ("support-ask",), "/support, /paysupport: write to the moderators (#464)"),
    S("AN-6", None, ("role-limits-reset",), "🛠 Reset my limit, done (#289)"),
    S("AN-7", None, ("support-sent",), "sent to the moderators (#464)"),
    S("AN-8", None, ("privacy-changed",), "the terms changed: agree again, first (#481)"),
)
del S

SCREEN_TREE = ScreenTree(SCREENS)

# The translation that starts each screen's message -> the screen's ID.
SCREEN_KEYS: dict[str, str] = {key: screen.id for screen in SCREENS for key in screen.keys}

# Screens that share their text with another: their code names them (`t.screen(...)`).
LABELLED_IN_CODE = frozenset(screen.id for screen in SCREENS if screen.labelled_in_code)

# Screens that never show their ID, yet are named by it: the Mini App's page (#320).
UNLABELLED = frozenset(screen.id for screen in SCREENS if not screen.shows_id)

# The IDs of screens that are gone: never used again.
RETIRED = frozenset(
    {
        "DL-5",  # the meeting time, typed or by buttons: the map's wheels instead (#312)
        "DL-6",  # 📎 → Location, the place question: the map instead (#297)
        "DL-7",  # a note on a point picked (#296)
        "DL-26",  # ⚖️ Meet halfway's list of spots (#297)
        "DL-30",  # your live location went off too soon: no location rule any more (#372)
        "NT-24",  # the location rule broken, it went off (#372)
        "NT-25",  # the location rule broken, never at the place (#372)
        "NT-36",  # your deletion request declined: deletions aren't declined any more (#480)
        "OF-1",  # the offers list's countries: SH-2 now, the one country picker (#329)
        "OF-2",  # its cities: SH-3, the one city picker (#329)
        "PS-2",  # a new account's cities across countries: SH-2, then SH-3 (#329)
        "SE-6",  # a saved search's city: SH-3 (#329)
        "ST-1",  # the very first /start's language question: the welcome's own row (#600)
    }
)

# Pop-up alerts: Telegram shows them without formatting.
ALERT_KEYS = frozenset({"button-expired"})


def label(screen_id: str, *, plain: bool = False) -> str:
    """What goes in front of a screen's text: `DL-1` in monospace, or [AN-2] in an alert."""
    return f"[{screen_id}] " if plain else f"<code>{screen_id}</code> "
