# Terms of Service

**Effective date:** 2026-05-20
**Version:** 1.0

These Terms of Service ("Terms") govern your use of **Signet** (the "Software"), provided by Savva Tsekmes ("we", "us", "our"). By installing the Software, opening it, creating a vault, or clicking "I agree" during setup, you ("you", "your") accept these Terms in full. If you do not accept these Terms, do not install or use the Software.

> **Mandatory consumer rights.** Nothing in these Terms excludes, restricts, or modifies any consumer guarantee, statutory right, or remedy you have under applicable law that cannot lawfully be excluded — including but not limited to liability for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, and for any other matter that cannot be limited under the consumer-protection laws of your country of residence (such as the Australian Consumer Law, the UK Consumer Rights Act 2015, and applicable EU consumer protection directives).

---

## 1. What Signet does

Signet is offline software that encrypts files, passwords, documents, and other personal information on your own computer or storage device. The encrypted vault file is stored only where you put it. We do not host your vault, your password, your recovery shards, or any data you enter. The current version of the Software, as distributed by us, is designed so that we cannot access your vault, password, or shards. We do not operate any service that receives this data.

## 2. License to use

We grant you a personal, worldwide, royalty-free, non-exclusive, non-transferable, revocable license to use the Software in object-code form for any lawful purpose, subject to these Terms. Where source code is published, that source code is made available under the license file accompanying it (e.g. `LICENSE`); in case of conflict between these Terms and that license as to the code itself, the source license controls.

## 3. The software is provided "AS IS"

Subject to the mandatory consumer rights statement above, the Software is provided **"as is" and "as available" without warranty of any kind**, express or implied. To the maximum extent permitted by applicable law, we disclaim all warranties, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Software will be error-free, uninterrupted, or secure against any attack, threat, or vulnerability, whether known or unknown, present or future, nor that any defects will be corrected, nor that the Software is free of harmful components.

You use the Software at your own risk.

## 4. Your responsibilities

You are solely responsible for:

**(a) Your master password.** The master password is the cryptographic key that protects your vault. We do not know it, we cannot recover it, and we have no mechanism to reset or bypass it. If you lose or forget your master password and do not have sufficient recovery shards to reconstruct the key, your vault will be permanently and irrevocably inaccessible. No one — including us — can help you recover the contents.

**(b) Your vault file.** The encrypted vault file (typically `vault.signet`) is the only place your data exists. If the file is deleted, corrupted, lost, or destroyed, and you do not have a separate backup, the data is permanently lost. You are responsible for maintaining your own backups.

**(c) Your recovery cards and shards.** If you enable Shamir secret sharing and generate recovery cards, you are responsible for printing, distributing, and safely storing those cards. Anyone in possession of the required number of shards can reconstruct your master key and decrypt your vault. Loss includes the foreseeable scenario where shard holders are unavailable, uncooperative, deceased, or have themselves lost their shard. Treat printed shards with the same care as cash or a house deed.

**(d) Your beneficiaries.** You choose who receives recovery shards. We are not responsible for the conduct of any person you give a shard to. The Software's "intended access" labels are advisory only and provide no cryptographic enforcement.

**(e) A sufficient master password.** You are responsible for choosing a master password of adequate strength. The strength meter is guidance, not a guarantee.

**(f) Physical security.** The Software protects against logical attacks on the vault file. It does not protect against attacks on the device where it runs (keyloggers, malware, an attacker who watches you type your password, or an attacker who modifies the Signet binary itself).

**(g) Lawful use.** You are responsible for ensuring your use complies with all laws applicable to you.

**(h) Age.** You confirm that you are at least 16 years old, or the age of digital consent in your jurisdiction (whichever is higher), and that you have legal capacity to enter into these Terms.

**(i) Export controls and sanctions.** You represent that you are not located in, under the control of, or a national of any country subject to a United States, United Kingdom, European Union, or other applicable government embargo or sanctions program (including but not limited to Cuba, Iran, North Korea, Syria, and the Crimea, Donetsk, and Luhansk regions of Ukraine); and that you are not listed on the U.S. Treasury OFAC SDN List, the U.S. Commerce Department Denied Persons List, or any equivalent restricted-party list. You are responsible for compliance with all export-control laws that apply to your use of the Software.

## 5. Cryptocurrency and digital-asset risk

You acknowledge and agree that:

- Seed phrases stored in the vault control real digital assets.
- If you lose your master password, lose your vault file, lose enough recovery shards, or your shard holders cannot or will not cooperate, **all digital assets controlled by seeds in the vault are permanently and irrevocably lost.**
- Software bugs, file corruption, hardware failure, theft, fire, and unforeseen attacks can also cause total loss.
- We are not a custodian, wallet, exchange, money-service business, money transmitter, broker, fiduciary, or financial advisor in any jurisdiction.
- You assume one-hundred percent of the financial risk associated with seeds you store in the vault.

## 6. Limitation of liability

Subject to the mandatory consumer rights statement at the top of these Terms, and to the maximum extent permitted by applicable law, in no event shall we be liable to you or any third party for any direct, indirect, incidental, special, consequential, punitive, or exemplary damages arising out of or related to your use or inability to use the Software, including loss of data, loss of access to your vault, loss of money or digital assets stored or referenced in the vault, inability of a beneficiary or heir to recover the vault, loss of business or revenue, or costs of substitute services, whether based on warranty, contract, tort (including negligence), strict liability, or any other legal theory.

Where any liability cannot be excluded by law, our total cumulative liability to you for any cause shall be limited to one hundred Australian dollars (AUD 100) or the equivalent in your local currency. The Software is free; this nominal floor is provided solely to satisfy jurisdictions that prohibit zero-liability clauses.

**Time bar.** Any claim arising out of or related to the Software must be brought within one (1) year after the event giving rise to it, or be permanently barred, to the extent that statutory law permits such a contractual limitation in your jurisdiction.

## 7. No third-party beneficiaries

These Terms create no rights in any person other than you. Without limiting the foregoing and to the maximum extent permitted by law, we owe no duty of care to any beneficiary, heir, executor, shard recipient, or other third party who is not a user of the Software, and no such person may bring a claim against us based on use or non-use of the Software by you or by them.

## 8. Indemnification

You agree to indemnify, defend, and hold us harmless from any **third-party claim, demand, loss, or expense (including reasonable legal fees) arising from (i) your unlawful use of the Software, (ii) your breach of these Terms, or (iii) your violation of any rights of any third party**. This indemnification does not apply to claims caused by defects in the Software itself. Our maximum recovery under this section is subject to the limitation of liability in Section 6.

We will give you prompt notice of any claim covered by this section, allow you to control its defense (with counsel reasonably acceptable to us), and reasonably cooperate. You may not settle any claim without our prior written consent.

## 9. Third-party components

The Software incorporates open-source libraries, each governed by its own license. A list of those libraries and their license texts is available in the "Open Source Licenses" view within the Software, in the project's `THIRD_PARTY_NOTICES` file, or on the project's public source repository. Your use of those components is governed by their respective licenses, which control over these Terms as to those components.

## 10. Updates

On launch, and when you click "Check for updates" in Settings, the Software makes one HTTPS request to the public GitHub Releases API to see whether a newer version has been published. No data about you, your vault, or your device is transmitted beyond the version string the GitHub API associates with such a request. You are not required to install any update. We may release updates that change, remove, or add features at any time. You may disable update checking at any time by leaving the Settings → Updates feature unused; no automatic background polling is performed beyond the single on-launch check.

## 11. No professional advice

The Software is a storage tool. We do not provide legal, financial, estate-planning, tax, security, or any other professional advice. The Software's beneficiary and recovery-card features are technical tools, not legal instruments. **Printing recovery cards does not constitute a valid will or any legally binding inheritance document in any jurisdiction.** Consult a qualified professional in your jurisdiction for any matter requiring such advice.

## 12. Modified builds

If you, or someone other than us, modify the Software's source code, recompile it, or distribute a build that is not an official release published by us, that modified build is not covered by these Terms; we do not warrant or support it; and we disclaim all liability for any consequence of its use. An "official release" is one published from our public source repository under a release tag and signed or attested by us.

## 13. Termination

These Terms remain in effect for as long as you use the Software. You may stop using the Software at any time by uninstalling it. We may discontinue the Software, including the release of new versions and the operation of the update endpoint, at any time without notice and without liability. Sections 3, 4, 5, 6, 7, 8, 9, 11, 12, 15, and 16 survive termination.

## 14. Changes to these Terms

We may revise these Terms from time to time. Material changes — including any change to limitation of liability, indemnification, governing law, or dispute-resolution provisions — take effect for you only after you accept the revised version on next launch of the Software. Non-material corrections may take effect on publication of the revised document. The current version is shown at the top of this document and within the Software's "About" screen.

## 15. Severability and waiver

If any provision of these Terms is held unenforceable, the remaining provisions remain in full force and effect, and the unenforceable provision shall be modified to the minimum extent necessary to make it enforceable. Our failure to enforce any right is not a waiver of that right.

## 16. Governing law and venue

These Terms are governed by the laws of **Australia** and, where applicable, the State of **Victoria**, without regard to conflict-of-law rules. Subject to any mandatory consumer-protection rights you have in your country of residence (which may permit you to bring proceedings in your local courts), any dispute arising out of or relating to these Terms or the Software shall be brought only in the competent courts of **Victoria, Australia**, and you consent to the personal jurisdiction of those courts.

## 17. Entire agreement

These Terms, together with the Privacy Policy and any applicable open-source license accompanying the source code, constitute the entire agreement between you and us regarding the Software.

## 18. Contact

Questions about these Terms: **savva@savvatsekmes.com**.

---

By clicking "I agree" and proceeding through setup, you acknowledge that you have read these Terms in their entirety, that you understand them, and that you accept them. The Software records the version number above and the date and time of your acceptance inside the vault you create.
