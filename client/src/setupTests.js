import '@testing-library/jest-dom';

// Mock URL.createObjectURL / revokeObjectURL — not implemented in jsdom.
// These are used by CropModal to create/revoke object URLs for image files.
URL.createObjectURL = () => 'blob:mock-object-url';
URL.revokeObjectURL = () => {};
