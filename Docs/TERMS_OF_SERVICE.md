# Terms of Service

**Effective date: 2026-05-20**
**Version: 1.0**

These Terms of Service ("Terms") govern your use of **Signet** (the "Software"), a local, encrypted file vault provided by Savva Tsekmes ("we", "us", "our"). By installing, opening, or using the Software, including by clicking "I agree" during setup, you ("you", "your") accept these Terms in full. If you do not accept these Terms, do not install or use the Software.

---

## 1. What Signet does

Signet is offline software that encrypts files, passwords, documents, and other personal information on your own computer or storage device. The encrypted vault file is stored only where you put it. We do not host your vault, your password, your recovery shards, or any data you enter. We do not have access to any of it at any time, including in the event of password loss or other recovery requests.

## 2. The software is provided "AS IS"

THE SOFTWARE IS PROVIDED **"AS IS" AND "AS AVAILABLE"** WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO:

- IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT;
- THAT THE SOFTWARE WILL BE ERROR-FREE, UNINTERRUPTED, OR SECURE AGAINST ALL POSSIBLE ATTACKS;
- THAT ANY DEFECTS WILL BE CORRECTED;
- THAT THE SOFTWARE OR THE SERVERS THAT MAKE IT AVAILABLE ARE FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.

You use the Software entirely at your own risk.

## 3. Your responsibilities

You are solely responsible for:

**(a) Your master password.** The master password is the cryptographic key that protects your vault. We do not know it, we cannot recover it, and we have no mechanism by which to reset or bypass it. **If you lose or forget your master password and do not have sufficient recovery shards to reconstruct it, your vault will be permanently and irrevocably inaccessible.** No one — including us — can help you recover the contents.

**(b) Your vault file.** The encrypted vault file (typically `vault.signet`) is the only place your data exists. If the file is deleted, corrupted, lost, or destroyed (for example, by losing a USB drive, formatting a disk, or a hardware failure), and you do not have a separate backup, the data is permanently lost. You are responsible for maintaining your own backups in whatever form and frequency you choose.

**(c) Your recovery cards and shards.** If you enable Shamir secret sharing and generate recovery cards, you are responsible for printing, distributing, and safely storing those cards. Anyone in possession of the required number of shards can reconstruct your master key and decrypt your vault. **Treat printed shards with the same care as cash or a house deed.**

**(d) Your beneficiaries.** You choose who receives recovery shards. We are not responsible for the conduct of any person you give a shard to, whether they use the shard as intended, whether they cooperate with other shard holders, or what they do with information they recover. The Software's "intended access" labels are advisory only and provide no cryptographic enforcement.

**(e) Selecting a sufficient master password.** You are responsible for choosing a master password of adequate strength. The Software displays a strength meter as guidance, but the final choice is yours. Weak passwords are vulnerable to brute-force attack regardless of any protection the Software provides.

**(f) Physical security.** The Software protects against logical attacks on the vault file. It does not protect against attacks on the physical device where the vault or the Software runs (e.g., keyloggers, malware, an attacker who watches you type your password, or an attacker who modifies the Signet binary itself). You are responsible for the physical and operational security of your devices.

**(g) Lawful use.** You are responsible for ensuring your use of the Software complies with all laws applicable to you, including but not limited to laws regarding encryption, data protection, and content stored.

## 4. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL WE BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OR INABILITY TO USE THE SOFTWARE, INCLUDING BUT NOT LIMITED TO:

- LOSS OF DATA, INCLUDING LOSS OF ACCESS TO YOUR VAULT;
- LOSS OF MONEY OR DIGITAL ASSETS (INCLUDING CRYPTOCURRENCY) STORED, REFERENCED, OR DESCRIBED IN THE VAULT;
- INABILITY OF A BENEFICIARY OR HEIR TO RECOVER THE VAULT;
- LOSS OF BUSINESS, REVENUE, OR PROFITS;
- COSTS OF SUBSTITUTE GOODS OR SERVICES;
- BODILY OR EMOTIONAL HARM;

WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT LIABILITY, OR ANY OTHER LEGAL THEORY, AND WHETHER OR NOT WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

In jurisdictions where this limitation cannot be enforced, our total cumulative liability to you for any cause shall not exceed the amount you paid for the Software, which for the free version is zero.

## 5. Indemnification

You agree to indemnify, defend, and hold us harmless from any claim, demand, loss, or expense (including reasonable legal fees) arising from your use of the Software, your violation of these Terms, or your violation of any rights of any third party.

## 6. Third-party components

The Software incorporates open-source libraries (including but not limited to Tauri, React, libsodium / sodiumoxide, sharks, printpdf, qrcode, csv, ureq, and others), each governed by its own license. We are not responsible for the conduct, output, or security of these components, and your use of the Software is also subject to the licenses of those components.

## 7. Updates

The Software may, with your explicit action via a "Check for updates" button or by displaying an update-available notification on launch, make a network request to a public release endpoint (currently GitHub Releases) to check whether a newer version is available. We do not transmit any data about you, your vault, or your device in that request beyond the version string the GitHub API associates with the request itself. You are not required to install any update. We may release updates that change, remove, or add features at any time.

## 8. No professional advice

The Software is a storage tool. Information you put into the vault, including documents that describe wishes, instructions, will provisions, or financial arrangements, is your own creation. We do not provide legal, financial, estate planning, tax, security, or any other professional advice, and the Software's existence does not constitute such advice. **You should consult a qualified professional in your jurisdiction for any matter requiring such advice, including the legal validity of any estate or inheritance instrument you store in the vault.**

## 9. Beneficiary and inheritance considerations

The Software's beneficiary and recovery-card features are technical tools, not legal instruments. **Printing recovery cards does not constitute a valid will or any other legally binding inheritance document in any jurisdiction.** Any wishes for transfer of digital assets, including cryptocurrency seeds stored in the vault, must be enacted through whatever legal instruments are appropriate in your jurisdiction. We do not act as executor, escrow, witness, or notary for any vault.

## 10. Unauthorized modification

If you modify the Software's source code, or use a modified build, these Terms continue to govern your use of any unmodified portion. We are not responsible for any consequence of using a modified build, including but not limited to security weaknesses introduced by the modification.

## 11. Termination

These Terms remain in effect for as long as you use the Software. You may stop using the Software at any time by uninstalling it. We may discontinue the Software, including the release of new versions and the operation of the update endpoint, at any time and for any reason, without notice and without liability.

## 12. Changes to these Terms

We may revise these Terms from time to time. The current version is reflected by the **Version** number at the top of this document. If you continue to use the Software after a revised version is published, you accept the revised Terms. If you do not accept the revised Terms, you should stop using the Software.

## 13. Severability

If any provision of these Terms is held unenforceable, the remaining provisions remain in full force and effect, and the unenforceable provision shall be modified to the minimum extent necessary to make it enforceable.

## 14. Entire agreement

These Terms, together with the Privacy Policy, constitute the entire agreement between you and us regarding the Software, and supersede any prior agreement or understanding.

## 15. Governing law

These Terms are governed by the laws of the jurisdiction where Savva Tsekmes resides, without regard to its conflict-of-law provisions. Any dispute arising out of or relating to these Terms or the Software shall be brought only in the courts of that jurisdiction, and you consent to the personal jurisdiction of those courts.

## 16. Contact

Questions about these Terms: **savva@savvatsekmes.com**.

---

By clicking "I agree" or by creating a vault, you acknowledge that you have read these Terms in their entirety, that you understand them, and that you accept them.
