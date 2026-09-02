"""add revoked tokens table for JWT blacklisting

Revision ID: add_revoked_tokens
Revises:
Create Date: 2026-08-26 19:37:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = 'add_revoked_tokens'
down_revision = None  # Update this to your latest migration revision
branch_labels = None
depends_on = None


def upgrade():
    # Create revoked_tokens table for JWT blacklisting
    op.create_table(
        'revoked_tokens',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('jti', sa.String(255), nullable=False, unique=True),
        sa.Column('token_hash', sa.String(64), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('reason', sa.String(100), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )

    # Create indexes for fast lookups
    op.create_index('ix_revoked_tokens_jti', 'revoked_tokens', ['jti'])
    op.create_index('ix_revoked_tokens_token_hash', 'revoked_tokens', ['token_hash'])
    op.create_index('ix_revoked_tokens_user_id', 'revoked_tokens', ['user_id'])


def downgrade():
    op.drop_index('ix_revoked_tokens_user_id', 'revoked_tokens')
    op.drop_index('ix_revoked_tokens_token_hash', 'revoked_tokens')
    op.drop_index('ix_revoked_tokens_jti', 'revoked_tokens')
    op.drop_table('revoked_tokens')
