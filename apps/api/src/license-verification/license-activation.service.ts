import { Injectable, Logger } from '@nestjs/common';
import { LicenseVerificationService } from './license-verification.service';
import { SignedLicenseArtifactResponseDto, DeploymentCheckInResponseDto, OMNIGRC_VERSION } from '@omnigrc/shared';

@Injectable()
export class LicenseActivationClientService {
  private readonly logger = new Logger(LicenseActivationClientService.name);

  constructor(private readonly verificationService: LicenseVerificationService) {}

  /**
   * Perform initial activation handshake with Control Plane.
   */
  async activateDeployment(controlPlaneUrl: string, deploymentId: string, registrationSecret: string): Promise<SignedLicenseArtifactResponseDto> {
    const url = `${controlPlaneUrl.replace(/\/$/, '')}/v1/deployments/${deploymentId}/activate`;

    this.logger.log(`Initiating activation handshake for deployment "${deploymentId}"`);

    // Never log registration secret in logs!
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationSecret }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      this.logger.error(`Activation handshake failed with HTTP status ${res.status}`);
      throw new Error(`Activation failed (${res.status}): ${errText}`);
    }

    const data: SignedLicenseArtifactResponseDto = await res.json();

    if (data.artifact) {
      this.verificationService.verifyArtifact(data.artifact);
      await this.verificationService.saveVerifiedState(data.artifact);
      this.logger.log(`Successfully activated and cached verified license artifact for deployment "${deploymentId}"`);
    }

    return data;
  }

  /**
   * Perform check-in handshake with Control Plane and process updated license artifacts.
   */
  async checkInDeployment(
    controlPlaneUrl: string,
    deploymentId: string,
    registrationSecret: string,
    version: string = process.env.OMNIGRC_VERSION || OMNIGRC_VERSION,
  ): Promise<DeploymentCheckInResponseDto> {
    const url = `${controlPlaneUrl.replace(/\/$/, '')}/v1/deployments/${deploymentId}/check-in`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationSecret, version }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      this.logger.warn(`Check-in failed with HTTP status ${res.status}`);
      throw new Error(`Check-in failed (${res.status}): ${errText}`);
    }

    const data: DeploymentCheckInResponseDto = await res.json();

    if (data.artifact) {
      try {
        this.verificationService.verifyArtifact(data.artifact);
        await this.verificationService.saveVerifiedState(data.artifact);
        this.logger.log('Refreshed verified license artifact received during check-in');
      } catch (err: any) {
        this.logger.error(`Check-in license artifact verification failed: ${err.message}`);
      }
    }

    return data;
  }
}
