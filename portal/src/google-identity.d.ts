interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
}

interface GoogleRenderButtonOptions {
  type: 'standard';
  theme: 'outline' | 'filled_black';
  size: 'large';
  text: 'continue_with';
  shape: 'rectangular';
  width: number;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize(config: GoogleIdConfiguration): void;
        renderButton(parent: HTMLElement, options: GoogleRenderButtonOptions): void;
      };
    };
  };
}
