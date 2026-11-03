/** Stroke icons drawn on a 24px grid; they take the current text colour. */
type IconProps = { size?: number };

const Svg = ({ size = 16, children, fill = 'none' }: IconProps & { children: React.ReactNode; fill?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const SearchIcon = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
export const HomeIcon = (p: IconProps) => <Svg {...p}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></Svg>;
export const StarIcon = (p: IconProps) => <Svg {...p}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></Svg>;
export const ChevronIcon = (p: IconProps) => <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>;
export const FolderIcon = (p: IconProps) => <Svg {...p}><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" /></Svg>;
export const SignOutIcon = (p: IconProps) => <Svg {...p}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3" /></Svg>;
export const ExternalIcon = (p: IconProps) => <Svg {...p}><path d="M7 17 17 7M8 7h9v9" /></Svg>;
export const MenuIcon = (p: IconProps) => <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>;
export const HelpIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.5v.01" /></Svg>;
export const LinkIcon = (p: IconProps) => <Svg {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Svg>;
export const KeyboardIcon = (p: IconProps) => <Svg {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9" /></Svg>;
export const PlusIcon = (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const CheckIcon = (p: IconProps) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const CloseIcon = (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const GoogleIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4zM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22zM6.4 14a6 6 0 0 1 0-4V7.4H3.1a10 10 0 0 0 0 9zM12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" />
  </svg>
);
export const DocIcon = (p: IconProps) => <Svg {...p}><path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M8.5 13h7M8.5 17h5" /></Svg>;
export const SheetIcon = (p: IconProps) => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 10h16M4 15h16M10 4v16" /></Svg>;
export const SlidesIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="5" width="18" height="12" rx="1.5" /><path d="M12 17v3M8 20h8" /></Svg>;
export const ImageIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="1.5" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-9 9" /></Svg>;
export const VideoIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="5" width="13" height="14" rx="1.5" /><path d="m16 10 5-3v10l-5-3" /></Svg>;
export const RefreshIcon = (p: IconProps) => <Svg {...p}><path d="M20 11a8 8 0 0 0-14.7-4.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.7 4.3l1.3-1.8M20 20v-4.5h-4.5" /></Svg>;
export const ClockIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const SunIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;
export const MoonIcon = (p: IconProps) => <Svg {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Svg>;
export const EditIcon = (p: IconProps) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></Svg>;
export const ShareIcon = (p: IconProps) => <Svg {...p}><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></Svg>;
export const MailIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></Svg>;
export const UsersIcon = (p: IconProps) => <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M18 8v6M15 11h6" /></Svg>;
export const HashIcon = (p: IconProps) => <Svg {...p}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></Svg>;
