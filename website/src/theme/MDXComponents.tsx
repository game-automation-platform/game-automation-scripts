import MDXComponents from '@theme-original/MDXComponents';
import ImagePlaceholder from '@site/src/components/ImagePlaceholder';

// Registered globally so any page can write <ImagePlaceholder .../> with no import.
export default {
  ...MDXComponents,
  ImagePlaceholder,
};
