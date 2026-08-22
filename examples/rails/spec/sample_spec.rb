require 'rails_helper'

RSpec.describe Sample, type: :model do
  it 'requires a name' do
    expect(Sample.new).not_to be_valid
  end
end
