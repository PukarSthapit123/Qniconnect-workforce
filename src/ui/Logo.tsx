import { cn } from '@/lib/utils';
import logoOnDark from '@/assets/qniconnect-logo.png';
import logoOnLight from '@/assets/qniconnect-logo-dark.png';

/* The QniConnect logo (QC's QniConnect_Logo.png, white wordmark, and
   QniConnect_Logo_Dark.png, dark-green wordmark). The top bar and the sign-in
   card's banner are the inverse surface in both themes, so the white wordmark
   is the default; `on="light"` picks the dark-green one for a light surface.
   Each PNG carries transparent padding above and below the mark, so the
   image is taller than the 20px (17px on a phone) the mark itself shows, and
   the negative margins give that padding back to the layout. */
export function Logo({ className, on = 'inverse' }: { className?: string; on?: 'inverse' | 'light' }) {
  return (
    <img src={on === 'light' ? logoOnLight : logoOnDark} alt="QniConnect" draggable={false}
      className={cn('block h-[38px] w-auto shrink-0 -my-[9px] max-md:h-8 max-md:-my-[7.5px]', className)} />
  );
}
