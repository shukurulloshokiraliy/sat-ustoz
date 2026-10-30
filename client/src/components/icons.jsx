// Icons: Phosphor (https://phosphoricons.com), wrapped so the app keeps one naming scheme.
// <IconX width={18} /> sets the size; pass weight="duotone" | "bold" | "fill" where a heavier mark fits.
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowsClockwise, BookOpenText, BookmarkSimple, Briefcase, Cards, CaretDown, ChartLineUp, Check, Clock, Copy, Crown, DotsThree, DownloadSimple, Eye, EyeSlash, FileText, Fire, Flag, GameController, GearSix, Globe, InstagramLogo, Key, Lightning, Link, List, ListChecks, Lock, MagnifyingGlass, Medal, Moon, PaperPlaneRight, Path, PencilSimple, Play, Plus, Printer, Prohibit, SignOut, SpeakerHigh, SquaresFour, Stack, Sun, Target, TelegramLogo, Trash, UploadSimple, User, UsersThree, X } from '@phosphor-icons/react';

const ph = (C, base = 'regular') => function Icon({ width, height, size, weight, strokeWidth, ...rest }) {
  return <C size={size || width || height || 20} weight={weight || base} aria-hidden="true" {...rest} />;
};

export const IconDashboard = ph(SquaresFour);
export const IconRoad = ph(Path);
export const IconQuiz = ph(ListChecks);
export const IconChart = ph(ChartLineUp);
export const IconBookmark = ph(BookmarkSimple);
export const IconBookmarkFill = ph(BookmarkSimple, 'fill');
export const IconBriefcase = ph(Briefcase);
export const IconUsers = ph(UsersThree);
export const IconLayers = ph(Stack);
export const IconUser = ph(User);
export const IconSun = ph(Sun);
export const IconMoon = ph(Moon);
export const IconLogout = ph(SignOut);
export const IconPlus = ph(Plus);
export const IconUpload = ph(UploadSimple);
export const IconDownload = ph(DownloadSimple);
export const IconTrash = ph(Trash);
export const IconEdit = ph(PencilSimple);
export const IconCheck = ph(Check);
export const IconX = ph(X);
export const IconEye = ph(Eye);
export const IconEyeOff = ph(EyeSlash);
export const IconFlame = ph(Fire);
export const IconTarget = ph(Target);
export const IconClock = ph(Clock);
export const IconChevron = ph(CaretDown);
export const IconBack = ph(ArrowLeft);
export const IconArrow = ph(ArrowRight);
export const IconMenu = ph(List);
export const IconFlag = ph(Flag);
export const IconStrike = ph(Prohibit);
export const IconCopy = ph(Copy);
export const IconKey = ph(Key);
export const IconAward = ph(Medal);
export const IconPrint = ph(Printer);
export const IconBolt = ph(Lightning);
export const IconSearch = ph(MagnifyingGlass);
export const IconLink = ph(Link);
export const IconLock = ph(Lock);
export const IconPlay = ph(Play);
export const IconDoc = ph(FileText);
export const IconUp = ph(ArrowUp);
export const IconDown = ph(ArrowDown);
export const IconSettings = ph(GearSix);
export const IconCrown = ph(Crown);
export const IconGlobe = ph(Globe);
export const IconInstagram = ph(InstagramLogo);
export const IconTelegram = ph(TelegramLogo);
export const IconRefresh = ph(ArrowsClockwise);
export const IconSend = ph(PaperPlaneRight);
export const IconBook = ph(BookOpenText);
export const IconGame = ph(GameController);
export const IconMore = ph(DotsThree);
export const IconVolume = ph(SpeakerHigh);
export const IconFlip = ph(Cards);

export const IconGoogle = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
  </svg>
);

/**
 * SAT Ustoz wordmark: “SAT” in Unbounded with “Ustoz” raised in a Sun badge.
 * tone: 'auto' (Night on light, white on dark theme) · 'white' (on Night) · 'sky' (white + white badge, on Sky Blue)
 */
export function Logo({ size = 28, tone = 'auto', label = 'SAT Ustoz' }) {
  return (
    <span className={`logo logo-${tone}`} style={{ fontSize: size }} role="img" aria-label={label}>
      <b aria-hidden="true">SAT</b><i aria-hidden="true">Ustoz</i>
    </span>
  );
}

/** App icon: white rounded square, “S” in Night Ink, “U” on a Sun dot. */
export function AppIcon({ size = 40 }) {
  return (
    <span className="app-icon" style={{ width: size, height: size, fontSize: size }} aria-hidden="true">
      <b>S</b><i>U</i>
    </span>
  );
}
