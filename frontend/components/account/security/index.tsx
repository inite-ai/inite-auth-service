'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { SecuritySectionProps } from './types'
import SecurityCard from './SecurityCard'
import TwoFactorSetupModal from './TwoFactorSetupModal'
import TwoFactorDisableModal from './TwoFactorDisableModal'

export default function SecuritySection({ securityStatus, accessToken, onUpdate }: SecuritySectionProps) {
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [show2FASetup, setShow2FASetup] = useState(false)
  const [show2FADisable, setShow2FADisable] = useState(false)
  const [loading, setLoading] = useState(false)

  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)

  // 2FA
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [disableCode, setDisableCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/identity/change-password', {
        currentPassword,
        newPassword,
      }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast.success('Password changed successfully')
      setShowPasswordForm(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onUpdate()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  const handleSetup2FA = async () => {
    setLoading(true)
    try {
      const { data } = await api.post('/auth/identity/2fa/setup', {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      setQrCode(data.qrCode)
      setSecret(data.secret)
      setShow2FASetup(true)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to setup 2FA')
    } finally {
      setLoading(false)
    }
  }

  const handleEnable2FA = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast.error('Please enter a valid 6-digit code')
      return
    }

    setLoading(true)
    try {
      const { data } = await api.post('/auth/identity/2fa/enable', {
        code: verificationCode,
      }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      setBackupCodes(data.backupCodes)
      toast.success('2FA enabled successfully!')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  const handleDisable2FA = async () => {
    if (!disableCode || disableCode.length !== 6) {
      toast.error('Please enter a valid 6-digit code')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/identity/2fa/disable', {
        code: disableCode,
        password: disablePassword,
      }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast.success('2FA disabled successfully')
      setShow2FADisable(false)
      setDisableCode('')
      setDisablePassword('')
      onUpdate()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to disable 2FA')
    } finally {
      setLoading(false)
    }
  }

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'))
    toast.success('Backup codes copied to clipboard')
  }

  const closeBackupCodesModal = () => {
    setBackupCodes([])
    setShow2FASetup(false)
    setVerificationCode('')
    setSecret('')
    setQrCode('')
    onUpdate()
  }

  const securityScore = (() => {
    let score = 0
    if (securityStatus.hasPassword) score += 20
    if (securityStatus.twoFactorEnabled) score += 30
    if (securityStatus.passkeysCount > 0) score += 25
    if (securityStatus.walletsCount > 0) score += 15
    if (securityStatus.emailVerified) score += 10
    return score
  })()

  const getScoreColor = () => {
    if (securityScore >= 80) return 'from-emerald-500 to-green-500'
    if (securityScore >= 50) return 'from-amber-500 to-yellow-500'
    return 'from-red-500 to-orange-500'
  }

  return (
    <>
      <SecurityCard
        securityStatus={securityStatus}
        securityScore={securityScore}
        getScoreColor={getScoreColor}
        loading={loading}
        showPasswordForm={showPasswordForm}
        setShowPasswordForm={setShowPasswordForm}
        currentPassword={currentPassword}
        setCurrentPassword={setCurrentPassword}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        confirmPassword={confirmPassword}
        setConfirmPassword={setConfirmPassword}
        showPasswords={showPasswords}
        setShowPasswords={setShowPasswords}
        handleChangePassword={handleChangePassword}
        handleSetup2FA={handleSetup2FA}
        setShow2FADisable={setShow2FADisable}
      />

      <TwoFactorSetupModal
        show2FASetup={show2FASetup}
        setShow2FASetup={setShow2FASetup}
        qrCode={qrCode}
        secret={secret}
        verificationCode={verificationCode}
        setVerificationCode={setVerificationCode}
        backupCodes={backupCodes}
        loading={loading}
        handleEnable2FA={handleEnable2FA}
        copyBackupCodes={copyBackupCodes}
        closeBackupCodesModal={closeBackupCodesModal}
      />

      <TwoFactorDisableModal
        show2FADisable={show2FADisable}
        setShow2FADisable={setShow2FADisable}
        disablePassword={disablePassword}
        setDisablePassword={setDisablePassword}
        disableCode={disableCode}
        setDisableCode={setDisableCode}
        loading={loading}
        handleDisable2FA={handleDisable2FA}
      />
    </>
  )
}
