import React from 'react';
import styles from './ImagePlaceholder.module.css';

/**
 * A labelled box standing in for a screenshot that has not been taken yet.
 *
 * Every placeholder is listed in website/IMAGES_NEEDED.md by its `id`, and
 * `npm run refs:check` keeps that list and the pages in step. When the image
 * arrives, drop it in static/img/<id>.png and pass `src` -- the box becomes a
 * figure with the same caption, so the page needs no other edit.
 */
export default function ImagePlaceholder({
  id,
  alt,
  src,
  width,
}: {
  id: string;
  alt: string;
  src?: string;
  width?: string | number;
}): React.JSX.Element {
  const style = width === undefined ? undefined : {maxWidth: width};
  if (src) {
    return (
      <figure className={styles.figure} style={style} data-image-id={id}>
        <img src={src} alt={alt} />
        <figcaption>{alt}</figcaption>
      </figure>
    );
  }
  return (
    <figure className={styles.placeholder} style={style} role="img" aria-label={alt} data-image-id={id}>
      <div className={styles.label}>
        Image needed: <code>{id}</code>
      </div>
      <figcaption>{alt}</figcaption>
    </figure>
  );
}
