import Image from 'next/image';
import styles from './ParcelaLogo.module.css';

interface Props {
  size?: 'sm' | 'md' | 'lg';
}

export default function ParcelaLogo({ size = 'md' }: Props) {
  const heights: Record<string, number> = { sm: 24, md: 32, lg: 48 };
  const widths:  Record<string, number> = { sm: 100, md: 133, lg: 200 };
  const h = heights[size];
  const w = widths[size];

  return (
    <div className={styles.logoWrapper}>
      <Image
        src="/parcela-logo.svg"
        alt="Parcela"
        width={w}
        height={h}
        priority
      />
    </div>
  );
}
